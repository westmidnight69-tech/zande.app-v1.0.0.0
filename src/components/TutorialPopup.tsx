import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

const TUTORIAL_STEPS = [
  {
    title: "Welcome to Zande 👋",
    text: "We're excited to help automate your business. Let's take a quick 3-step tour of your new dashboard.",
    icon: "waving_hand"
  },
  {
    title: "Track Cashflow 💸",
    text: "Your Dashboard gives you a bird's-eye view. Easily track overdue invoices, collected revenue, and expenses.",
    icon: "monitoring"
  },
  {
    title: "Quick Actions ⚡",
    text: "Add expenses, create invoices, or upload receipts instantly using the action buttons right on the main screen.",
    icon: "bolt"
  },
  {
    title: "More Tools 🛠️",
    text: "Tap the 'More' icon on the bottom menu to access Growth Analytics, connect your Bank, and manage Settings.",
    icon: "grid_view"
  }
];

export default function TutorialPopup() {
  const { business } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasDismissed, setHasDismissed] = useState(false); // fast local state

  useEffect(() => {
    if (!business) return;

    // First time user check: strict local storage truth
    const storageKey = `tutorial_seen_${business.id}`;
    const hasSeenTutorial = localStorage.getItem(storageKey) === 'true';

    // Show if they haven't seen it and haven't dismissed it this session
    if (!hasSeenTutorial && !hasDismissed) {
      // Delay slightly for smooth entrance after dashboard loads
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [business?.id, hasDismissed]);

  // Don't render anything if it's closed
  if (!isOpen) return null;

  const step = TUTORIAL_STEPS[currentStep];

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setHasDismissed(true);
    if (business?.id) {
      localStorage.setItem(`tutorial_seen_${business.id}`, 'true');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500 relative">
        {/* Progress header */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-surface-muted">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%` }}
          />
        </div>

        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 z-10 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>

        <div className="p-8 text-center flex flex-col items-center">
          <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6 shadow-inner">
            <span className="material-symbols-outlined text-3xl">{step.icon}</span>
          </div>
          
          <h3 className="font-display text-xl font-bold text-white mb-3">{step.title}</h3>
          <div className="h-20 flex items-center justify-center mb-8">
            <p className="text-slate-400 text-sm leading-relaxed">
              {step.text}
            </p>
          </div>

          <div className="w-full flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(s => s - 1)}
                className="px-4 py-3 border border-border-subtle text-slate-300 rounded-xl text-[11px] font-mono uppercase tracking-widest font-bold hover:bg-surface-muted transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 py-3 bg-primary text-black rounded-xl text-[11px] font-mono uppercase tracking-widest font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              {currentStep === TUTORIAL_STEPS.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
