import React, { useState } from 'react';
import { getStoredAuth } from '../api/client.js';
import { Calculator, Sparkles, Dices, Zap, X } from 'lucide-react';

interface CrazyCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CrazyCalculator: React.FC<CrazyCalculatorProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [humorMessage, setHumorMessage] = useState<string>('Ready for crazy math...');
  const [isLoading, setIsLoading] = useState(false);
  const [lastRolls, setLastRolls] = useState<number[] | null>(null);

  if (!isOpen) return null;

  const auth = getStoredAuth();
  const token = auth?.token || '';

  const callApi = async (operation: string, a: number, b: number = 0) => {
    setIsLoading(true);
    setLastRolls(null);
    try {
      const baseUrl = auth?.hubUrl || (window.location.origin.includes('5173') ? 'http://localhost:3000' : window.location.origin);
      const res = await fetch(`${baseUrl}/api/v1/calc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ operation, a, b }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.result !== null && data.result !== undefined) {
          setDisplay(String(data.result));
        }
        setHumorMessage(data.message || 'Calculated successfully!');
        if (data.extra?.rolls) {
          setLastRolls(data.extra.rolls);
        }
      } else {
        setHumorMessage(data.error?.message || 'Error occurred in math matrix!');
      }
    } catch (err: unknown) {
      setHumorMessage(`Failed: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
      setPrevVal(null);
      setOp(null);
    }
  };

  const handleDigit = (digit: string) => {
    setDisplay((prev) => (prev === '0' || prev === 'Error' ? digit : prev + digit));
  };

  const handleOp = (operator: string) => {
    setPrevVal(parseFloat(display));
    setOp(operator);
    setDisplay('0');
  };

  const handleEqual = () => {
    const current = parseFloat(display);
    if (prevVal === null || !op) return;

    let operation = 'add';
    if (op === '+') operation = 'add';
    else if (op === '-') operation = 'subtract';
    else if (op === '×' || op === '*') operation = 'multiply';
    else if (op === '÷' || op === '/') operation = 'divide';
    else if (op === '^') operation = 'power';

    callApi(operation, prevVal, current);
  };

  const handleFactorial = () => {
    const current = parseFloat(display);
    callApi('factorial', current);
  };

  const handleDice = () => {
    callApi('dice', 2, 6);
  };

  const handleGlitch = () => {
    callApi('quantum_glitch', 0);
  };

  const handleDivZero = () => {
    callApi('divide', 42, 0);
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevVal(null);
    setOp(null);
    setHumorMessage('Ready for crazy math...');
    setLastRolls(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border-2 border-hub-accent/40 bg-hub-surface p-5 shadow-2xl shadow-hub-accent/20">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between border-b border-hub-border pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hub-accent/20 text-hub-accent">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-hub-text">Crazy Calculator</h2>
              <span className="text-xs text-hub-accent">Powered by Agent Hub API</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-hub-muted transition hover:bg-hub-border hover:text-hub-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Display Screen */}
        <div className="mb-4 rounded-xl border border-hub-border bg-hub-bg p-3.5 text-right font-mono">
          <div className="h-5 text-xs text-hub-muted">
            {prevVal !== null && `${prevVal} ${op}`}
          </div>
          <div className="overflow-x-auto text-2xl font-bold tracking-wider text-hub-text">
            {isLoading ? <span className="animate-pulse text-hub-accent">Computing...</span> : display}
          </div>
        </div>

        {/* Humorous Message Box */}
        <div className="mb-4 min-h-[44px] rounded-lg border border-hub-accent/20 bg-hub-accent/10 p-2.5 text-center text-xs font-medium text-hub-accent">
          {humorMessage}
          {lastRolls && (
            <div className="mt-1 font-mono text-[11px] text-hub-muted">
              Dice Faces: [{lastRolls.join(', ')}]
            </div>
          )}
        </div>

        {/* Crazy Feature Buttons */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <button
            onClick={handleDice}
            className="flex items-center justify-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 py-2 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 active:scale-95"
            title="Roll 2d6 Dice"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>2d6</span>
          </button>
          <button
            onClick={handleFactorial}
            className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 active:scale-95"
            title="Factorial (n!)"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>n!</span>
          </button>
          <button
            onClick={handleGlitch}
            className="flex items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 active:scale-95"
            title="Quantum Glitch"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Glitch</span>
          </button>
          <button
            onClick={handleDivZero}
            className="rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 active:scale-95"
            title="Divide 42 by 0"
          >
            / 0
          </button>
        </div>

        {/* Standard Keypad */}
        <div className="grid grid-cols-4 gap-2 text-sm font-semibold">
          <button
            onClick={handleClear}
            className="col-span-2 rounded-lg bg-hub-danger/20 py-2.5 text-hub-danger hover:bg-hub-danger/30 active:scale-95"
          >
            Clear
          </button>
          <button
            onClick={() => handleOp('^')}
            className="rounded-lg bg-hub-border py-2.5 text-hub-text hover:bg-hub-border/80 active:scale-95"
          >
            ^
          </button>
          <button
            onClick={() => handleOp('÷')}
            className="rounded-lg bg-hub-accent/20 py-2.5 text-hub-accent hover:bg-hub-accent/30 active:scale-95"
          >
            ÷
          </button>

          <button onClick={() => handleDigit('7')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">7</button>
          <button onClick={() => handleDigit('8')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">8</button>
          <button onClick={() => handleDigit('9')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">9</button>
          <button onClick={() => handleOp('×')} className="rounded-lg bg-hub-accent/20 py-2.5 text-hub-accent hover:bg-hub-accent/30 active:scale-95">×</button>

          <button onClick={() => handleDigit('4')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">4</button>
          <button onClick={() => handleDigit('5')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">5</button>
          <button onClick={() => handleDigit('6')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">6</button>
          <button onClick={() => handleOp('-')} className="rounded-lg bg-hub-accent/20 py-2.5 text-hub-accent hover:bg-hub-accent/30 active:scale-95">-</button>

          <button onClick={() => handleDigit('1')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">1</button>
          <button onClick={() => handleDigit('2')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">2</button>
          <button onClick={() => handleDigit('3')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">3</button>
          <button onClick={() => handleOp('+')} className="rounded-lg bg-hub-accent/20 py-2.5 text-hub-accent hover:bg-hub-accent/30 active:scale-95">+</button>

          <button onClick={() => handleDigit('0')} className="col-span-2 rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">0</button>
          <button onClick={() => handleDigit('.')} className="rounded-lg bg-hub-bg py-2.5 text-hub-text hover:bg-hub-border active:scale-95">.</button>
          <button
            onClick={handleEqual}
            className="rounded-lg bg-hub-accent py-2.5 text-white shadow-md shadow-hub-accent/40 hover:bg-hub-accent/90 active:scale-95"
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
};
