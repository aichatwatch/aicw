/**
 * Interruptible delay utility for proper Ctrl+C handling
 *
 * This module provides a delay function that can be properly interrupted
 * when the process receives a SIGINT signal (Ctrl+C), allowing clean
 * shutdown and return to the menu system.
 */

// Track if the process has been interrupted
let interrupted = false;

// Set interrupt flag when SIGINT is received
// Only register handler if NOT running as a pipeline child process
// Pipeline children should exit immediately when interrupted (default SIGINT behavior)
if (!process.env.AICW_PIPELINE_STEP) {
  process.on('SIGINT', () => {
    interrupted = true;
  });
}

/**
 * Creates a promise that resolves after the specified delay in milliseconds.
 * If the process is interrupted (SIGINT), the promise will reject with an
 * "Operation cancelled" error, allowing proper cleanup and return to menu.
 *
 * @param ms - The delay duration in milliseconds
 * @returns A promise that resolves after the delay or rejects if interrupted
 * @throws {Error} Throws "Operation cancelled" if interrupted by SIGINT
 */
export function interruptibleDelay(ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already interrupted before setting timer
    if (interrupted) {
      reject(new Error('Operation cancelled'));
      return;
    }

    let checkInterval: NodeJS.Timeout;

    const timer = setTimeout(() => {
      clearInterval(checkInterval);
      if (interrupted) {
        reject(new Error('Operation cancelled'));
      } else {
        resolve();
      }
    }, ms);

    // Clean up timer if we detect interruption during the delay
    checkInterval = setInterval(() => {
      if (interrupted) {
        clearInterval(checkInterval);
        clearTimeout(timer);
        reject(new Error('Operation cancelled'));
      }
    }, 100); // Check every 100ms for interruption

    // Ensure cleanup when promise resolves normally
    timer.unref();
  });
}

/**
 * Legacy delay function name for backward compatibility.
 * Delegates to interruptibleDelay.
 */
export const delay = interruptibleDelay;

/**
 * Reset the interrupted flag (useful for testing or restarting operations)
 */
export function resetInterruptFlag(): void {
  interrupted = false;
}

/**
 * Check if the process has been interrupted
 */
export function isInterrupted(): boolean {
  return interrupted;
}