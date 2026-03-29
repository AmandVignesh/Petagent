class FocusTimer {
    constructor(displayElement) {
        this.display = displayElement;
        this.duration = 25 * 60; // seconds
        this.remaining = this.duration;
        this.interval = null;
        this.isRunning = false;
        
        this.updateDisplay();
    }
    
    setDuration(minutes) {
        this.duration = minutes * 60;
        this.remaining = this.duration;
        this.updateDisplay();
        this.stop();
    }
    
    start() {
        if (!this.isRunning && this.remaining > 0) {
            this.isRunning = true;
            this.interval = setInterval(() => {
                this.remaining--;
                this.updateDisplay();
                if (this.remaining <= 0) {
                    this.stop();
                    document.dispatchEvent(new Event('timer-complete'));
                }
            }, 1000);
        }
    }
    
    pause() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.interval);
        }
    }
    
    stop() {
        this.pause();
        this.remaining = this.duration;
        this.updateDisplay();
    }
    
    reset() {
        this.stop();
        document.dispatchEvent(new Event('timer-reset'));
    }
    
    updateDisplay() {
        const m = Math.floor(this.remaining / 60).toString().padStart(2, '0');
        const s = (this.remaining % 60).toString().padStart(2, '0');
        this.display.innerText = `${m}:${s}`;
    }
}
