import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pause, Settings } from 'lucide-react';

// --- Constants ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;
const MIN_SPEED = 50;

// --- Audio Engine ---
let audioCtx: AudioContext | null = null;
const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
};

const playArcadeSound = (type: 'eat' | 'die' | 'move' | 'stageUp' | 'click') => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'eat':
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'die':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.5);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      case 'move':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      case 'stageUp':
        osc.type = 'square';
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        notes.forEach((freq, i) => {
          osc.frequency.setValueAtTime(freq, now + i * 0.1);
        });
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      case 'click':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
    }

    // Note: We no longer close the context after every sound to improve performance
  } catch (e) {
    console.error('Audio error:', e);
  }
};

type Point = { x: number; y: number };
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// --- Storage Utils ---
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }
};

const SnakeGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game State
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }]);
  const [food, setFood] = useState<Point>({ x: 5, y: 5 });
  const [direction, setDirection] = useState<Direction>('UP');
  // Visual direction for immediate feedback
  const [visualDirection, setVisualDirection] = useState<Direction>('UP');
  
  // Input Queue for extreme responsiveness
  const directionQueue = useRef<Direction[]>([]);
  
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [stage, setStage] = useState(1);
  const [seedsEaten, setSeedsEaten] = useState(0);
  
  // Timing Refs for snappy input
  const lastMoveRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Settings State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [colorTheme, setColorTheme] = useState<'neon' | 'emerald' | 'ruby'>('neon');
  const [baseSpeedSetting, setBaseSpeedSetting] = useState(INITIAL_SPEED);

  const obstacles: Point[] = useMemo(() => stage === 2 ? [
    { x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 5 },
    { x: 14, y: 5 }, { x: 14, y: 6 }, { x: 13, y: 5 },
    { x: 5, y: 14 }, { x: 5, y: 13 }, { x: 6, y: 14 },
    { x: 14, y: 14 }, { x: 14, y: 13 }, { x: 13, y: 14 },
    { x: 10, y: 15 }, { x: 10, y: 16 }, { x: 10, y: 4 }, { x: 9, y: 5 }, { x: 11, y: 5 } // Avoided 10,10 center
  ] : [], [stage]);
  
  const [particles, setParticles] = useState<{x: number, y: number, vx: number, vy: number, life: number, color: string}[]>([]);
  const [screenShake, setScreenShake] = useState(0);
  const [segmentSwirl, setSegmentSwirl] = useState<{ index: number, time: number }[]>([]);
  
  // Audio System
  const playSound = (type: 'eat' | 'die' | 'move' | 'stageUp' | 'click') => {
    if (isSoundEnabled) {
      playArcadeSound(type);
    }
  };

  const createParticles = (x: number, y: number, color: string) => {
    const newParticles = [];
    for (let i = 0; i < 15; i++) {
        newParticles.push({
            x: x + 0.5,
            y: y + 0.5,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            life: 1.0,
            color
        });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  // --- Initialization ---
  useEffect(() => {
    const savedHighScore = safeStorage.getItem('snake-high-score');
    if (savedHighScore) setHighScore(parseInt(savedHighScore, 10));

    const savedSound = safeStorage.getItem('snake-sound');
    if (savedSound !== null) setIsSoundEnabled(savedSound === 'true');

    const savedTheme = safeStorage.getItem('snake-theme');
    if (savedTheme) setColorTheme(savedTheme as any);

    const savedBaseSpeed = safeStorage.getItem('snake-base-speed');
    if (savedBaseSpeed) setBaseSpeedSetting(parseInt(savedBaseSpeed, 10));
  }, []);

  useEffect(() => {
    safeStorage.setItem('snake-sound', isSoundEnabled.toString());
    safeStorage.setItem('snake-theme', colorTheme);
    safeStorage.setItem('snake-base-speed', baseSpeedSetting.toString());
  }, [isSoundEnabled, colorTheme, baseSpeedSetting]);

  // Update particles
  useEffect(() => {
    if (particles.length === 0) return;
    const interval = setInterval(() => {
      setParticles(prev => {
        const next = prev
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.08 }))
          .filter(p => p.life > 0);
        if (next.length === 0 && prev.length > 0) return [];
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [particles.length > 0]); // Only re-run when status changes from no-particles to having-particles

  const generateFood = useCallback((currentSnake: Point[]): Point => {
    let newFood: Point;
    let attempts = 0;
    while (attempts < 100) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const onSnake = currentSnake.some(p => p.x === newFood.x && p.y === newFood.y);
      const onObstacle = obstacles.some(p => p.x === newFood.x && p.y === newFood.y);
      if (!onSnake && !onObstacle) return newFood;
      attempts++;
    }
    return { x: 1, y: 1 }; // Fallback
  }, [obstacles]);

  const handleGameOver = useCallback(() => {
    setIsGameOver(true);
    setScreenShake(20);
    playSound('die');
  }, []);

  const resetGame = useCallback(() => {
    setSnake([{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }]);
    setDirection('UP');
    directionQueue.current = [];
    setScore(0);
    setStage(1);
    setSeedsEaten(0);
    setIsGameOver(false);
    setIsPaused(false);
    setSpeed(baseSpeedSetting);
    setFood(generateFood([{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }]));
    setParticles([]);
    setGameStarted(true);
    playSound('click');
  }, [baseSpeedSetting, generateFood]);

  // --- Game Loop Management ---
  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const speedRef = useRef(speed);
  const stageRef = useRef(stage);
  const seedsEatenRef = useRef(seedsEaten);
  const scoreRef = useRef(score);

  useEffect(() => { snakeRef.current = snake; }, [snake]);
  useEffect(() => { foodRef.current = food; }, [food]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { seedsEatenRef.current = seedsEaten; }, [seedsEaten]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  // --- Game Mechanics ---
  const moveSnake = useCallback(() => {
    // Pull next direction from queue
    let nextDir = directionRef.current;
    if (directionQueue.current.length > 0) {
      nextDir = directionQueue.current.shift()!;
    }
    
    const currentSnake = snakeRef.current;
    const currentFood = foodRef.current;
    
    setDirection(nextDir);
    setVisualDirection(nextDir); // Sync visual direction on move
    const head = currentSnake[0];
    const newHead = { ...head };

    switch (nextDir) {
      case 'UP': newHead.y -= 1; break;
      case 'DOWN': newHead.y += 1; break;
      case 'LEFT': newHead.x -= 1; break;
      case 'RIGHT': newHead.x += 1; break;
    }

    // Dimensional Wrapping
    if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
    if (newHead.x >= GRID_SIZE) newHead.x = 0;
    if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
    if (newHead.y >= GRID_SIZE) newHead.y = 0;

    // Obstacle Collision
    if (obstacles.some(p => p.x === newHead.x && p.y === newHead.y)) {
      handleGameOver();
      return;
    }

    // Self Collision
    if (currentSnake.some(p => p.x === newHead.x && p.y === newHead.y)) {
      handleGameOver();
      return;
    }

    const newSnake = [newHead, ...currentSnake];

    // Food Consumption
    if (newHead.x === currentFood.x && newHead.y === currentFood.y) {
      const nextSeedsCount = seedsEatenRef.current + 1;
      setSeedsEaten(nextSeedsCount);

      if (stageRef.current === 1 && nextSeedsCount >= 3) {
        setStage(2);
        playSound('stageUp');
      }

      setScore(prev => {
        const newScore = prev + 10;
        if (newScore > highScore) {
          setHighScore(newScore);
          safeStorage.setItem('snake-high-score', newScore.toString());
        }
        return newScore;
      });
      setFood(generateFood(newSnake));
      setSpeed(prev => Math.max(MIN_SPEED, prev - SPEED_INCREMENT));
      createParticles(currentFood.x, currentFood.y, '#f43f5e');
      setScreenShake(8);
      setSegmentSwirl(prev => [...prev, { index: 0, time: Date.now() }]);
      playSound('eat');
    } else {
      newSnake.pop();
    }

    setSnake(newSnake);
    lastMoveRef.current = Date.now();
  }, [obstacles, generateFood, highScore, handleGameOver]);

  // --- Game Loop ---
  useEffect(() => {
    if (!gameStarted || isGameOver || isPaused) return;

    const runLoop = () => {
      moveSnake();
      timerRef.current = setTimeout(runLoop, speedRef.current);
    };

    timerRef.current = setTimeout(runLoop, speed);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameStarted, isGameOver, isPaused, speed, moveSnake]);

  // Store direction in a ref to provide the most current value to event listeners without re-attaching them
  const directionRef = useRef<Direction>(direction);
  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  const changeDirection = useCallback((newDir: Direction) => {
    if (isGameOver || isPaused) return;
    
    const queue = directionQueue.current;
    // Get the last intended direction from queue or current direction
    const lastDir = queue.length > 0 ? queue[queue.length - 1] : directionRef.current;
    
    let valid = false;
    switch (newDir) {
      case 'UP': if (lastDir !== 'DOWN' && lastDir !== 'UP') valid = true; break;
      case 'DOWN': if (lastDir !== 'UP' && lastDir !== 'DOWN') valid = true; break;
      case 'LEFT': if (lastDir !== 'RIGHT' && lastDir !== 'LEFT') valid = true; break;
      case 'RIGHT': if (lastDir !== 'LEFT' && lastDir !== 'RIGHT') valid = true; break;
    }
    
    if (valid && queue.length < 3) {
      queue.push(newDir);
      setVisualDirection(newDir); // Immediate visual feedback
      playSound('move');

      // Snappy Input Optimization: 
      // If we are more than 60% through the current move cycle, 
      // trigger the next move slightly earlier to feel "swift"
      const now = Date.now();
      const elapsed = now - lastMoveRef.current;
      const currentSpeed = speedRef.current;
      
      if (elapsed > currentSpeed * 0.6) {
        // We don't trigger it "instantly" to avoid glitches, 
        // but we significantly shorten the remaining wait
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          // Trigger after a tiny buffer to allow visual update to settle
          timerRef.current = setTimeout(() => {
              // Trigger the next move immediately because we clear and restart
              const runNext = () => {
                  moveSnake();
                  timerRef.current = setTimeout(runNext, speedRef.current);
              };
              runNext();
          }, 10); 
        }
      }
    }
  }, [isGameOver, isPaused, moveSnake]);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': 
        case 'w':
        case 'W':
          changeDirection('UP'); break;
        case 'ArrowDown':
        case 's':
        case 'S':
          changeDirection('DOWN'); break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          changeDirection('LEFT'); break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          changeDirection('RIGHT'); break;
        case 'p': case 'P': 
          setIsPaused(prev => !prev);
          playSound('click');
          break;
        case 'r': case 'R': resetGame(); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeDirection, isPaused, gameStarted, isGameOver]); // Removed direction dependency

  // --- Rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply Screen Shake
    ctx.save();
    if (screenShake > 0) {
      const dx = (Math.random() - 0.5) * screenShake;
      const dy = (Math.random() - 0.5) * screenShake;
      ctx.translate(dx, dy);
      setScreenShake(prev => Math.max(0, prev - 1));
    }

    // Clear canvas
    const bgColor = stage === 2 ? '#0f0a28' : '#050510';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Subtle)
    ctx.strokeStyle = stage === 2 ? 'rgba(79, 70, 229, 0.15)' : 'rgba(163, 230, 28, 0.05)';
    ctx.lineWidth = 1;
    const cellSize = canvas.width / GRID_SIZE;
    
    // Draw horizontal lines
    for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
    }
    // Draw vertical lines
    for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();
    }
    
    // Draw highlight at intersections
    ctx.fillStyle = stage === 2 ? 'rgba(79, 70, 229, 0.1)' : 'rgba(163, 230, 28, 0.03)';
    for (let i = 0; i <= GRID_SIZE; i++) {
      for (let j = 0; j <= GRID_SIZE; j++) {
        ctx.beginPath();
        ctx.arc(i * cellSize, j * cellSize, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Obstacles (Stage 2)
    if (stage === 2) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#8b5cf6';
      obstacles.forEach(obs => {
        const x = obs.x * cellSize;
        const y = obs.y * cellSize;
        
        // Block base
        const gradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(1, '#4338ca');
        ctx.fillStyle = gradient;
        
        // Rounded block
        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + cellSize - radius, y);
        ctx.quadraticCurveTo(x + cellSize, y, x + cellSize, y + radius);
        ctx.lineTo(x + cellSize, y + cellSize - radius);
        ctx.quadraticCurveTo(x + cellSize, y + cellSize, x + cellSize - radius, y + cellSize);
        ctx.lineTo(x + radius, y + cellSize);
        ctx.quadraticCurveTo(x, y + cellSize, x, y + cellSize - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        
        // Shine detail
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    }

    // Colors
    const themeColors = {
      neon: { food: '#f43f5e', snake: '#a3e635', snakeAlt: '#84cc16', glow: '#a3e635' },
      emerald: { food: '#f59e0b', snake: '#10b981', snakeAlt: '#059669', glow: '#10b981' },
      ruby: { food: '#3b82f6', snake: '#ef4444', snakeAlt: '#dc2626', glow: '#ef4444' }
    };
    const currentTheme = themeColors[colorTheme];

    // Draw Food
    const foodPulse = Math.sin(Date.now() / 150) * 3;
    const fx = food.x * cellSize + cellSize / 2;
    const fy = food.y * cellSize + cellSize / 2;
    const fRadius = cellSize / 2.5 + foodPulse / 2;

    ctx.shadowBlur = 15 + foodPulse * 2;
    ctx.shadowColor = currentTheme.food;
    ctx.fillStyle = currentTheme.food;
    
    // Draw actual "fruit" shape
    ctx.beginPath();
    ctx.arc(fx, fy, fRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Stem
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy - fRadius);
    ctx.quadraticCurveTo(fx + 5, fy - fRadius - 5, fx + 2, fy - fRadius - 8);
    ctx.stroke();
    
    ctx.shadowBlur = 0;

    // Draw Snake
    const headPulse = Math.sin(Date.now() / 100) * 2;
    const now = Date.now();
    snake.forEach((p, index) => {
      const isHead = index === 0;
      const x = p.x * cellSize;
      const y = p.y * cellSize;
      
      // Swell effect if this segment just "ate"
      let sizeMod = 0;
      const swirl = segmentSwirl.find(s => s.index === index);
      if (swirl) {
          const elapsed = now - swirl.time;
          if (elapsed < 500) {
              sizeMod = Math.sin((elapsed / 500) * Math.PI) * 4;
          }
      }

      const radius = isHead ? 4 : 2;
      
      ctx.fillStyle = isHead ? currentTheme.snake : currentTheme.snakeAlt;
      
      if (isHead) {
        ctx.shadowBlur = 15 + headPulse;
        ctx.shadowColor = currentTheme.glow;
      }
      
      // Draw rounded segment
      ctx.beginPath();
      ctx.roundRect(x + 1 - sizeMod/2, y + 1 - sizeMod/2, cellSize - 2 + sizeMod, cellSize - 2 + sizeMod, radius);
      ctx.fill();
      
      // Eyes for head
      if (isHead) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'black';
        const eyeSize = 3;
        const eyeOffset = 5;
        
        // Adjust eye position based on direction
        const headDir = visualDirection;
        if (headDir === 'UP') {
          ctx.fillRect(x + eyeOffset, y + eyeOffset, eyeSize, eyeSize);
          ctx.fillRect(x + cellSize - eyeOffset - eyeSize, y + eyeOffset, eyeSize, eyeSize);
        } else if (headDir === 'DOWN') {
          ctx.fillRect(x + eyeOffset, y + cellSize - eyeOffset - eyeSize, eyeSize, eyeSize);
          ctx.fillRect(x + cellSize - eyeOffset - eyeSize, y + cellSize - eyeOffset - eyeSize, eyeSize, eyeSize);
        } else if (headDir === 'LEFT') {
          ctx.fillRect(x + eyeOffset, y + eyeOffset, eyeSize, eyeSize);
          ctx.fillRect(x + eyeOffset, y + cellSize - eyeOffset - eyeSize, eyeSize, eyeSize);
        } else if (headDir === 'RIGHT') {
          ctx.fillRect(x + cellSize - eyeOffset - eyeSize, y + eyeOffset, eyeSize, eyeSize);
          ctx.fillRect(x + cellSize - eyeOffset - eyeSize, y + cellSize - eyeOffset - eyeSize, eyeSize, eyeSize);
        }
      }
      
      ctx.shadowBlur = 0;
    });

    // Draw Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color || currentTheme.food;
        ctx.beginPath();
        ctx.arc(p.x * cellSize, p.y * cellSize, 2 * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    ctx.restore(); // Restore from Screen Shake

  }, [snake, food, particles, stage, colorTheme, screenShake, segmentSwirl, visualDirection]);

  // Handle animation frame for smoothness
  useEffect(() => {
      let frameId: number;
      const update = () => {
          // Trigger re-render for animations (pulses, particles)
          setParticles(prev => [...prev]); // Trigger effect (though we might want a simple dummy state)
          frameId = requestAnimationFrame(update);
      };
      frameId = requestAnimationFrame(update);
      return () => cancelAnimationFrame(frameId);
  }, []);

  // Update segment swirl times and indexes
  useEffect(() => {
    if (isPaused || isGameOver || !gameStarted) return;
    const interval = setInterval(() => {
        setSegmentSwirl(prev => {
            const next = prev.map(s => ({ ...s, index: s.index + 1 }))
                .filter(s => s.index < snake.length && (Date.now() - s.time) < 2000); // 2s max life
            return next;
        });
    }, speed);
    return () => clearInterval(interval);
  }, [snake.length, isPaused, isGameOver, gameStarted, speed]);

  // Resize handling
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const boardContainer = canvasRef.current.parentElement;
        if (boardContainer) {
          const size = Math.max(100, Math.min(boardContainer.clientWidth - 8, boardContainer.clientHeight - 8, 1000));
          canvasRef.current.width = size;
          canvasRef.current.height = size;
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex flex-col h-screen h-[100svh] h-[100dvh] bg-black text-lime-400 font-mono crt-line overflow-hidden" ref={containerRef}>
      {/* Arcade Header */}
      <header className="w-full shrink-0 py-1 md:py-2 px-4 md:px-8 flex justify-between items-end border-b-4 md:border-b-8 border-indigo-900 bg-slate-900 z-10 shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
        <div>
          <div className="text-rose-500 text-[8px] md:text-[11px] font-black tracking-[0.2em] md:tracking-[0.4em] mb-0 uppercase">Player 01 - Stage {stage}</div>
          <motion.div 
            key={score}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="text-3xl md:text-7xl font-black text-lime-400 tracking-tighter leading-none"
          >
            {score.toLocaleString('en-US', { minimumIntegerDigits: 6 })}
          </motion.div>
        </div>
        
        <div className="flex gap-4 md:gap-20 text-right">
          <div>
            <div className="text-slate-400 text-[8px] md:text-[11px] font-black uppercase tracking-widest mb-0">Hi-Score</div>
            <div className="text-lg md:text-4xl font-black text-white leading-none">
              {highScore.toLocaleString('en-US', { minimumIntegerDigits: 6 })}
            </div>
          </div>
          <button 
            onClick={() => { setSettingsOpen(true); playSound('click'); }}
            className="p-1 md:p-2 bg-indigo-600 text-white rounded-sm self-center hover:bg-indigo-500 transition-colors"
          >
            <Settings size={14} className="md:w-5 md:h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex p-1 md:p-3 gap-0 md:gap-4 overflow-hidden relative">
        {/* Left Sidebar: Stats (Desktop only) */}
        <aside className="w-64 hidden xl:flex flex-col gap-4">
          <div className="bg-slate-900 border-2 border-indigo-500 p-4 rounded-sm">
            <h3 className="text-indigo-400 text-[10px] uppercase tracking-widest mb-3 border-b border-indigo-800 pb-2">Simulation Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs uppercase">Length</span>
                <span className="text-white text-xs">{snake.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs uppercase">Speed</span>
                <span className="text-white text-xs">{((INITIAL_SPEED - speed + 10) / 10).toFixed(1)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs uppercase">Target</span>
                <span className="text-white text-xs">Stage {stage}</span>
              </div>
              
              {stage === 1 && (
                <div className="pt-2">
                  <div className="flex justify-between text-[8px] text-lime-400 mb-1 font-bold">
                    <span>EVOLUTION PROG</span>
                    <span>{seedsEaten}/3</span>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,28,0.5)]" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(seedsEaten / 3) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1 bg-slate-900 border-2 border-slate-800 p-4 rounded-sm flex flex-col items-center justify-center relative overflow-hidden">
             <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="w-full h-full border-2 border-indigo-500 rotate-45 scale-150" />
             </div>
             <Trophy className="text-indigo-500 mb-2" size={32} />
             <div className="text-[10px] uppercase text-indigo-400 font-bold">Arcade Protocol</div>
          </div>
        </aside>

        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative bg-slate-950 border-4 md:border-[12px] border-indigo-500 rounded-lg md:rounded-[2.5rem] shadow-[0_0_40px_rgba(79,70,229,0.3),inset_0_0_60px_black] md:animate-pulse">
          <div className="relative p-2 md:p-6 bg-slate-900 rounded-md md:rounded-2xl shadow-2xl w-full h-full flex items-center justify-center overflow-hidden">
            <canvas 
              ref={canvasRef} 
              className="bg-black shadow-[0_0_50px_rgba(163,230,28,0.25)] border-2 md:border-8 border-indigo-950"
            />
          </div>

          {/* Arcade Overlays */}
          <AnimatePresence mode="wait">
            {!gameStarted && (
              <motion.div 
                key="start"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-slate-950/40"
              >
                <div className="text-center p-4 md:p-8 bg-slate-900 border-4 border-indigo-500 rounded-xl shadow-[0_0_50px_rgba(79,70,229,0.4)] mx-4">
                  <h1 className="text-3xl md:text-6xl font-display font-black italic uppercase tracking-tighter mb-4 md:mb-8 text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-cyan-400">
                    Snake Arcade
                  </h1>
                  <button 
                    onClick={resetGame}
                    className="px-8 md:px-12 py-3 md:py-4 bg-lime-400 text-black font-black uppercase tracking-widest rounded-sm hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_0_rgba(79,70,229,1)] md:shadow-[8px_8px_0_rgba(79,70,229,1)]"
                  >
                    Insert Coin
                  </button>
                  <div className="mt-12 text-white/40 text-[10px] uppercase tracking-widest flex flex-col gap-1 font-bold">
                    <span>[Arrows] to Navigate</span>
                    <span>[P] to Halt Simulation</span>
                  </div>
                </div>
              </motion.div>
            )}

            {isGameOver && (
              <motion.div 
                key="gameover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-xl bg-black/80"
              >
                <motion.div 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="text-center p-6 md:p-12 border-4 md:border-8 border-rose-600 bg-slate-950 mx-4"
                >
                  <h2 className="text-4xl md:text-6xl font-display font-black text-rose-500 uppercase tracking-tighter mb-4 shadow-rose-900/50 drop-shadow-xl">
                    FATAL ERROR
                  </h2>
                  <p className="text-white/60 uppercase tracking-[0.5em] text-xs mb-8">Simulation Length: {snake.length}</p>
                  <button 
                    onClick={resetGame}
                    className="flex items-center gap-4 mx-auto px-8 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-sm hover:bg-indigo-500 transition-all border-b-4 border-indigo-900"
                  >
                    <RotateCcw size={20} />
                    Reboot
                  </button>
                </motion.div>
              </motion.div>
            )}

            {isPaused && !isGameOver && (
              <motion.div 
                key="paused"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-sm bg-black/60"
              >
                <div className="text-center">
                  <h2 className="text-5xl font-display font-black text-cyan-400 uppercase tracking-widest mb-8 animate-pulse">Halted</h2>
                  <button 
                    onClick={() => {
                      setIsPaused(false);
                      playSound('click');
                    }}
                    className="p-6 bg-white text-black rounded-full hover:scale-110 active:scale-90 transition-transform shadow-[0_0_30px_white]"
                  >
                    <Play size={48} fill="currentColor" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar: Leaderboard (Desktop only) */}
        <aside className="w-64 hidden xl:flex flex-col gap-4">
          <div className="bg-slate-900 border-2 border-indigo-500 p-4 rounded-sm flex-1">
            <h3 className="text-indigo-400 text-[10px] uppercase tracking-widest border-b border-indigo-800 pb-2 mb-3">Leaderboard</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-indigo-300">01. NEO</span>
                <span className="text-white">024,400</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">02. TRN</span>
                <span className="text-white">018,210</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">03. FLY</span>
                <span className="text-white">015,900</span>
              </div>
              <div className="flex justify-between items-center text-xs border-2 border-lime-400/30 p-2 -mx-2 bg-lime-400/5 rounded">
                <span className="text-lime-400 font-bold tracking-widest">04. YOU</span>
                <span className="text-white font-bold">{score.toLocaleString('en-US', { minimumIntegerDigits: 6 })}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">05. ACE</span>
                <span className="text-slate-300">004,100</span>
              </div>
            </div>
            
            <div className="mt-8 space-y-2">
              <button 
                onClick={() => {
                  setIsPaused(!isPaused);
                  playSound('click');
                }}
                className="w-full bg-indigo-600 py-3 text-center text-[10px] font-bold uppercase tracking-widest rounded-sm cursor-pointer hover:bg-indigo-500 transition-colors"
              >
                Pause [P]
              </button>
              <button 
                onClick={() => setIsGameOver(true)}
                className="w-full bg-rose-600 py-3 text-center text-[10px] font-bold uppercase tracking-widest rounded-sm cursor-pointer hover:bg-rose-500 transition-colors"
              >
                Quit Game
              </button>
            </div>
          </div>
        </aside>
      </main>

      <footer className="h-28 md:h-40 shrink-0 bg-slate-900 border-t-8 border-indigo-900 flex justify-center items-center z-10 px-4 md:px-8">
        <div className="flex items-center gap-4 md:gap-24">
          <div className="grid grid-cols-3 gap-x-4 md:gap-x-16 gap-y-2 md:gap-y-6">
            <div />
            <button onPointerDown={(e) => { e.preventDefault(); changeDirection('UP'); }} className={`w-10 h-10 md:w-14 md:h-14 flex items-center justify-center border-4 rounded-xl transition-all ${visualDirection === 'UP' ? 'bg-lime-400 border-lime-400 text-black shadow-[0_0_20px_rgba(163,230,28,0.7)]' : 'border-indigo-600 text-indigo-400 shadow-[2px_2px_0_rgba(49,46,129,1)] md:shadow-[4px_4px_0_rgba(49,46,129,1)] hover:bg-indigo-900 active:translate-y-0.5 md:active:translate-y-1 active:shadow-none'}`}><ChevronUp className="w-4 h-4 md:w-6 md:h-6" strokeWidth={3} /></button>
            <div />
            <button onPointerDown={(e) => { e.preventDefault(); changeDirection('LEFT'); }} className={`w-10 h-10 md:w-14 md:h-14 flex items-center justify-center border-4 rounded-xl transition-all ${visualDirection === 'LEFT' ? 'bg-lime-400 border-lime-400 text-black shadow-[0_0_20px_rgba(163,230,28,0.7)]' : 'border-indigo-600 text-indigo-400 shadow-[2px_2px_0_rgba(49,46,129,1)] md:shadow-[4px_4px_0_rgba(49,46,129,1)] hover:bg-indigo-900 active:translate-y-0.5 md:active:translate-y-1 active:shadow-none'}`}><ChevronLeft className="w-4 h-4 md:w-6 md:h-6" strokeWidth={3} /></button>
            <button onPointerDown={(e) => { e.preventDefault(); changeDirection('DOWN'); }} className={`w-10 h-10 md:w-14 md:h-14 flex items-center justify-center border-4 rounded-xl transition-all ${visualDirection === 'DOWN' ? 'bg-lime-400 border-lime-400 text-black shadow-[0_0_20px_rgba(163,230,28,0.7)]' : 'border-indigo-600 text-indigo-400 shadow-[2px_2px_0_rgba(49,46,129,1)] md:shadow-[4px_4px_0_rgba(49,46,129,1)] hover:bg-indigo-900 active:translate-y-0.5 md:active:translate-y-1 active:shadow-none'}`}><ChevronDown className="w-4 h-4 md:w-6 md:h-6" strokeWidth={3} /></button>
            <button onPointerDown={(e) => { e.preventDefault(); changeDirection('RIGHT'); }} className={`w-10 h-10 md:w-14 md:h-14 flex items-center justify-center border-4 rounded-xl transition-all ${visualDirection === 'RIGHT' ? 'bg-lime-400 border-lime-400 text-black shadow-[0_0_20px_rgba(163,230,28,0.7)]' : 'border-indigo-600 text-indigo-400 shadow-[2px_2px_0_rgba(49,46,129,1)] md:shadow-[4px_4px_0_rgba(49,46,129,1)] hover:bg-indigo-900 active:translate-y-0.5 md:active:translate-y-1 active:shadow-none'}`}><ChevronRight className="w-4 h-4 md:w-6 md:h-6" strokeWidth={3} /></button>
          </div>
          
          <div className="h-12 md:h-20 w-1 md:w-1.5 bg-indigo-900/50 rounded-full"></div>

          <div className="flex items-center">
            <button 
              onClick={() => { setIsPaused(!isPaused); playSound('click'); }}
              className={`group flex items-center gap-2 md:gap-4 px-4 md:px-10 py-3 md:py-4 rounded-xl font-black uppercase tracking-wider md:tracking-[0.2em] text-[10px] md:text-xs transition-all shadow-[0_4px_0_rgba(0,0,0,0.5)] md:shadow-[0_6px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none ${
                isPaused 
                  ? 'bg-lime-400 text-black hover:bg-lime-300' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {isPaused ? <Play className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" /> : <Pause className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      </footer>
      {/* Settings Modal */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border-4 border-indigo-500 p-8 max-w-md w-full shadow-[0_0_50px_rgba(79,70,229,0.3)]"
            >
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-8 border-b-2 border-indigo-500 pb-4">Configuration</h2>
              
              <div className="space-y-8">
                {/* Sound Toggle */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Audio_Systems</span>
                  <button 
                    onClick={() => { setIsSoundEnabled(!isSoundEnabled); playSound('click'); }}
                    className={`px-4 py-2 text-xs font-bold uppercase transition-colors ${isSoundEnabled ? 'bg-lime-500 text-black' : 'bg-slate-800 text-slate-500'}`}
                  >
                    {isSoundEnabled ? 'Active' : 'Offline'}
                  </button>
                </div>

                {/* Theme Selector */}
                <div>
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest block mb-4">Visual_Matrix</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['neon', 'emerald', 'ruby'] as const).map(t => (
                      <button 
                        key={t}
                        onClick={() => { setColorTheme(t); playSound('click'); }}
                        className={`py-3 text-[10px] font-bold uppercase border-2 transition-all ${colorTheme === t ? 'border-white bg-white text-black' : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-indigo-500'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speed Setting */}
                <div>
                  <div className="flex justify-between mb-4">
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Initial_Velocity</span>
                    <span className="text-white font-bold">{200 - baseSpeedSetting}</span>
                  </div>
                  <input 
                    type="range"
                    min="50"
                    max="180"
                    step="10"
                    value={200 - baseSpeedSetting}
                    onChange={(e) => {
                      setBaseSpeedSetting(200 - parseInt(e.target.value, 10));
                      playSound('move');
                    }}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <div className="flex justify-between text-[8px] text-slate-600 mt-2 font-bold uppercase tracking-tighter">
                    <span>Chill</span>
                    <span>Standard</span>
                    <span>Lethal</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => { setSettingsOpen(false); playSound('click'); }}
                className="w-full mt-10 py-4 bg-indigo-600 text-white font-black uppercase tracking-widest hover:bg-indigo-500 transition-colors shadow-[0_4px_0_rgb(49,46,129)] active:translate-y-1 active:shadow-none"
              >
                Apply Changes
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SnakeGame;
