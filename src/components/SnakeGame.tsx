import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pause, Settings } from 'lucide-react';

// --- Constants ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;
const MIN_SPEED = 50;

type Point = { x: number; y: number };
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

const SnakeGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game State
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }]);
  const [food, setFood] = useState<Point>({ x: 5, y: 5 });
  const [direction, setDirection] = useState<Direction>('UP');
  const [nextDirection, setNextDirection] = useState<Direction>('UP');
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  
  // Audio placeholders (for logic)
  const playSound = (type: 'eat' | 'die' | 'move') => {
    // Logic for sound would go here
    console.debug(`Sound: ${type}`);
  };

  // --- Initialization ---
  useEffect(() => {
    const savedHighScore = localStorage.getItem('snake-high-score');
    if (savedHighScore) setHighScore(parseInt(savedHighScore, 10));
  }, []);

  const generateFood = useCallback((currentSnake: Point[]): Point => {
    let newFood: Point;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      // Ensure food doesn't spawn on snake
      const onSnake = currentSnake.some(p => p.x === newFood.x && p.y === newFood.y);
      if (!onSnake) break;
    }
    return newFood;
  }, []);

  const resetGame = () => {
    setSnake([{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }]);
    setDirection('UP');
    setNextDirection('UP');
    setScore(0);
    setIsGameOver(false);
    setIsPaused(false);
    setSpeed(INITIAL_SPEED);
    setFood(generateFood([{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }]));
    setGameStarted(true);
  };

  // --- Game Loop ---
  useEffect(() => {
    if (!gameStarted || isGameOver || isPaused) return;

    const moveSnake = () => {
      setDirection(nextDirection);
      const head = snake[0];
      const newHead = { ...head };

      switch (nextDirection) {
        case 'UP': newHead.y -= 1; break;
        case 'DOWN': newHead.y += 1; break;
        case 'LEFT': newHead.x -= 1; break;
        case 'RIGHT': newHead.x += 1; break;
      }

      // Border Collision
      if (
        newHead.x < 0 || 
        newHead.x >= GRID_SIZE || 
        newHead.y < 0 || 
        newHead.y >= GRID_SIZE
      ) {
        handleGameOver();
        return;
      }

      // Self Collision
      if (snake.some(p => p.x === newHead.x && p.y === newHead.y)) {
        handleGameOver();
        return;
      }

      const newSnake = [newHead, ...snake];

      // Food Consumption
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(prev => {
          const newScore = prev + 10;
          if (newScore > highScore) {
            setHighScore(newScore);
            localStorage.setItem('snake-high-score', newScore.toString());
          }
          return newScore;
        });
        setFood(generateFood(newSnake));
        setSpeed(prev => Math.max(MIN_SPEED, prev - SPEED_INCREMENT));
        playSound('eat');
      } else {
        newSnake.pop();
      }

      setSnake(newSnake);
    };

    const interval = setInterval(moveSnake, speed);
    return () => clearInterval(interval);
  }, [gameStarted, isGameOver, isPaused, snake, nextDirection, food, speed, highScore, generateFood]);

  const handleGameOver = () => {
    setIsGameOver(true);
    playSound('die');
  };

  const changeDirection = useCallback((newDir: Direction) => {
    if (isGameOver || isPaused) return;
    switch (newDir) {
      case 'UP': if (direction !== 'DOWN') setNextDirection('UP'); break;
      case 'DOWN': if (direction !== 'UP') setNextDirection('DOWN'); break;
      case 'LEFT': if (direction !== 'RIGHT') setNextDirection('LEFT'); break;
      case 'RIGHT': if (direction !== 'LEFT') setNextDirection('RIGHT'); break;
    }
  }, [direction, isGameOver, isPaused]);

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
        case 'p': case 'P': setIsPaused(prev => !prev); break;
        case 'r': case 'R': resetGame(); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [direction]);

  // --- Rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#0a0a0f'; // Darker theme
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const cellSize = canvas.width / GRID_SIZE;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    // Draw Food
    ctx.fillStyle = '#f43f5e'; // rose-500
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#f43f5e';
    ctx.beginPath();
    ctx.roundRect(
      food.x * cellSize + 2,
      food.y * cellSize + 2,
      cellSize - 4,
      cellSize - 4,
      4
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Snake
    snake.forEach((p, index) => {
      // Lime color gradient
      const limeColors = ['#a3e635', '#84cc16', '#65a30d', '#4d7c0f'];
      ctx.fillStyle = index === 0 ? limeColors[0] : limeColors[Math.min(index, limeColors.length - 1)];
      ctx.shadowBlur = index === 0 ? 15 : 0;
      ctx.shadowColor = limeColors[0];
      
      const padding = 1;
      ctx.fillRect(
        p.x * cellSize + padding,
        p.y * cellSize + padding,
        cellSize - padding * 2,
        cellSize - padding * 2
      );
      ctx.shadowBlur = 0;
    });

  }, [snake, food]);

  // Resize handling
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const boardContainer = canvasRef.current.parentElement;
        if (boardContainer) {
          const size = Math.min(boardContainer.clientWidth - 32, boardContainer.clientHeight - 32, 600);
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
    <div className="flex flex-col h-screen bg-slate-950 text-white font-mono overflow-hidden select-none crt-line" ref={containerRef}>
      {/* Retro Arcade Header */}
      <header className="w-full py-4 px-12 flex justify-between items-end border-b-4 border-indigo-900 bg-slate-900 z-10">
        <div>
          <div className="text-rose-500 text-[10px] font-bold tracking-[0.3em] mb-1 uppercase">Player 01</div>
          <div className="text-5xl font-black text-lime-400 tracking-tighter leading-none">
            {score.toLocaleString('en-US', { minimumIntegerDigits: 6 })}
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="text-indigo-400 text-[10px] font-bold tracking-[0.3em] mb-1 uppercase">High Score</div>
          <div className="text-3xl font-black text-white leading-none">
            {highScore.toLocaleString('en-US', { minimumIntegerDigits: 6 })}
          </div>
        </div>

        <div className="text-right">
          <div className="text-cyan-400 text-[10px] font-bold tracking-[0.3em] mb-1 uppercase">Speed</div>
          <div className="text-5xl font-black text-white leading-none">
            {((INITIAL_SPEED - speed + 10) / 10).toFixed(1)}x
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-8 gap-8 overflow-hidden">
        {/* Sidebar: Stats & Info */}
        <aside className="w-64 hidden xl:flex flex-col gap-6">
          <div className="bg-slate-900 border-2 border-indigo-500 p-4 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            <h3 className="text-indigo-400 text-[10px] uppercase tracking-widest border-b border-indigo-800 pb-2 mb-3">Simulation Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Length:</span>
                <span className="text-white">{snake.length} Units</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Status:</span>
                <span className="text-lime-400">{isPaused ? 'PAUSED' : 'ACTIVE'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Apples:</span>
                <span className="text-white">{(score / 10).toFixed(0)}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border-2 border-indigo-500 p-4 rounded-lg flex-1">
            <h3 className="text-indigo-400 text-[10px] uppercase tracking-widest border-b border-indigo-800 pb-2 mb-3">Diagnostic</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="aspect-square bg-slate-800 border-2 border-slate-700 flex items-center justify-center rounded">
                <div className="w-6 h-6 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse"></div>
              </div>
              <div className="aspect-square bg-slate-800 border-2 border-slate-700 flex items-center justify-center rounded opacity-30">
                <div className="w-4 h-4 bg-yellow-400 rotate-45"></div>
              </div>
              <div className="aspect-square bg-slate-800 border-2 border-slate-700 flex items-center justify-center rounded opacity-30"></div>
              <div className="aspect-square bg-slate-800 border-2 border-slate-700 flex items-center justify-center rounded opacity-30"></div>
            </div>
            <div className="mt-4 text-[9px] text-indigo-300 uppercase leading-tight font-bold">
              SYSTEM_CORE: OK<br />
              SNAKE_MEMBRANE: STABLE
            </div>
          </div>
        </aside>

        {/* Main Game Board */}
        <div className="flex-1 bg-black border-8 border-indigo-600 rounded-sm relative overflow-hidden flex items-center justify-center">
          <canvas 
            ref={canvasRef} 
            className="rounded shadow-2xl bg-black"
          />

          {/* Overlays */}
          <AnimatePresence mode="wait">
            {!gameStarted && (
              <motion.div 
                key="start"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-slate-950/40"
              >
                <div className="text-center p-8 bg-slate-900 border-4 border-indigo-500 rounded-xl shadow-[0_0_50px_rgba(79,70,229,0.4)]">
                  <h1 className="text-6xl font-display font-black italic uppercase tracking-tighter mb-8 text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-cyan-400">
                    Snake Arcade
                  </h1>
                  <button 
                    onClick={resetGame}
                    className="px-12 py-4 bg-lime-400 text-black font-black uppercase tracking-widest rounded-sm hover:scale-105 active:scale-95 transition-all shadow-[8px_8px_0_rgba(79,70,229,1)]"
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
                  className="text-center p-12 border-8 border-rose-600 bg-slate-950"
                >
                  <h2 className="text-6xl font-display font-black text-rose-500 uppercase tracking-tighter mb-4 shadow-rose-900/50 drop-shadow-xl">
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
                    onClick={() => setIsPaused(false)}
                    className="p-6 bg-white text-black rounded-full hover:scale-110 active:scale-90 transition-transform shadow-[0_0_30px_white]"
                  >
                    <Play size={48} fill="currentColor" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute bottom-4 right-4 text-right pointer-events-none opacity-50">
            <div className="text-white text-[9px] uppercase mb-1 tracking-widest font-bold">Arcade Status</div>
            <div className="text-cyan-400 font-bold flex items-center gap-2 text-[10px]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              ACTIVE_SIMULATION
            </div>
          </div>
        </div>

        {/* Leaderboard Sidebar */}
        <aside className="w-64 hidden xl:bg-slate-900 border-2 border-indigo-500 p-4 rounded-lg xl:flex flex-col">
          <h3 className="text-indigo-400 text-[10px] uppercase tracking-widest border-b border-indigo-800 pb-2 mb-3">Leaderboard</h3>
          <div className="space-y-4 flex-1">
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
          
          <div className="mt-auto space-y-2">
            <button 
              onClick={() => setIsPaused(!isPaused)}
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
        </aside>
      </main>

      {/* Footer Controls */}
      <footer className="p-6 bg-slate-900 flex flex-wrap justify-center items-center gap-8 md:gap-16 border-t border-indigo-900 z-10 transition-transform">
        {/* Direction Pad */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <button 
              onPointerDown={() => changeDirection('UP')}
              className={`w-10 h-10 border-2 rounded flex items-center justify-center text-xs font-bold transition-all active:scale-95 shadow-[0_4px_0_rgba(71,85,105,1)] active:shadow-none active:translate-y-1 ${direction === 'UP' ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 hover:border-slate-400 text-slate-400'}`}
            >
              W
            </button>
            <div className="flex gap-1">
              <button 
                onPointerDown={() => changeDirection('LEFT')}
                className={`w-10 h-10 border-2 rounded flex items-center justify-center text-xs font-bold transition-all active:scale-95 shadow-[0_4px_0_rgba(71,85,105,1)] active:shadow-none active:translate-y-1 ${direction === 'LEFT' ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 hover:border-slate-400 text-slate-400'}`}
              >
                A
              </button>
              <button 
                onPointerDown={() => changeDirection('DOWN')}
                className={`w-10 h-10 border-2 rounded flex items-center justify-center text-xs font-bold transition-all active:scale-95 shadow-[0_4px_0_rgba(71,85,105,1)] active:shadow-none active:translate-y-1 ${direction === 'DOWN' ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 hover:border-slate-400 text-slate-400'}`}
              >
                S
              </button>
              <button 
                onPointerDown={() => changeDirection('RIGHT')}
                className={`w-10 h-10 border-2 rounded flex items-center justify-center text-xs font-bold transition-all active:scale-95 shadow-[0_4px_0_rgba(71,85,105,1)] active:shadow-none active:translate-y-1 ${direction === 'RIGHT' ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 hover:border-slate-400 text-slate-400'}`}
              >
                D
              </button>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Controller</span>
            <span className="text-[9px] text-indigo-400/60 uppercase font-bold tracking-wider">Tactile Feedback Active</span>
          </div>
        </div>
        
        <div className="hidden md:block h-10 w-px bg-slate-800"></div>

        {/* Action Buttons */}
        <div className="flex items-center gap-6">
          <div className="flex gap-3">
             <button 
                onClick={() => setIsPaused(!isPaused)}
                className="px-5 py-2 border-2 border-indigo-600 bg-indigo-600/10 rounded text-[10px] uppercase font-black tracking-widest text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all active:scale-95"
              >
                {isPaused ? 'Resume' : 'Pause'} [P]
              </button>
              <button 
                onClick={resetGame}
                className="px-5 py-2 border-2 border-rose-600 bg-rose-600/10 rounded text-[10px] uppercase font-black tracking-widest text-rose-400 hover:bg-rose-600 hover:text-white transition-all active:scale-95"
              >
                Restart [R]
              </button>
          </div>
          <span className="hidden sm:inline text-[9px] text-slate-500 uppercase font-black tracking-widest w-24">Command Center</span>
        </div>
      </footer>
    </div>
  );
};

export default SnakeGame;
