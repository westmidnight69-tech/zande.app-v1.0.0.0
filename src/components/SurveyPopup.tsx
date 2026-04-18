import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { safeRequest } from '../lib/supabase-utils';
import { PrimaryButton, SecondaryButton } from './FormInputs';

export default function SurveyPopup() {
  const { business, setBusiness } = useAuth();
  const [showSurvey, setShowSurvey] = useState(false);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [overallRating, setOverallRating] = useState(0);
  const [navRating, setNavRating] = useState(0);
  const [missingFeatures, setMissingFeatures] = useState('');
  const [generalFeedback, setGeneralFeedback] = useState('');

  useEffect(() => {
    // Only evaluate if we have a resolved business record
    if (business && business.survey_completed === false) {
      const loginCount = business.login_count || 0;
      
      const createdAt = new Date(business.created_at).getTime();
      const now = new Date().getTime();
      const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

      if (loginCount >= 2 || hoursSinceCreation >= 48) {
        // Trigger condition met
        setShowSurvey(true);
      }
    }
  }, [business]);

  const handleDismiss = async () => {
    setShowSurvey(false);
    // Even if dismissed, we shouldn't bug them endlessly. 
    // Wait, users might want to be reminded. Let's not log survey_completed=true on dismiss.
    // They will get bugged again on next login until they fill it out.
  };

  const handleSubmit = async () => {
    if (!business) return;
    setIsSubmitting(true);

    try {
      // 1. Insert Survey
      await safeRequest(() => supabase
        .from('user_surveys')
        .insert([{
          business_id: business.id,
          overall_rating: overallRating,
          navigation_rating: navRating,
          feature_requests: missingFeatures,
          feedback: generalFeedback,
        }])
      );

      // 2. Mark survey completed on business profile
      await safeRequest(() => supabase
        .from('businesses')
        .update({ survey_completed: true })
        .eq('id', business.id)
      );

      // Update local context
      setBusiness({ ...business, survey_completed: true });
      setShowSurvey(false);
    } catch (err) {
      console.error('Error saving survey', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showSurvey) return null;

  const StarRating = ({ rating, setRating }: { rating: number, setRating: (val: number) => void }) => {
    return (
      <div className="flex gap-2 justify-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            className={`transition-all duration-300 ${rating >= star ? 'text-yellow-400 scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-slate-700 hover:text-slate-500 scale-100'}`}
          >
            <span className="material-symbols-outlined text-4xl">{rating >= star ? 'star' : 'star_border'}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500" 
        onClick={handleDismiss}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface border border-border-subtle rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 fade-in-0 duration-500 z-10">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 relative overflow-hidden text-center">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-indigo-500" />
          <h2 className="font-display text-2xl font-bold text-slate-100 mb-2">How are we doing?</h2>
          <p className="text-sm font-mono text-slate-400 tracking-wider">Help Zande grow with you</p>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {step === 1 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 fade-in">
              <div className="space-y-4 text-center">
                <label className="block text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">
                  Overall Satisfaction
                </label>
                <StarRating rating={overallRating} setRating={setOverallRating} />
              </div>

              <div className="space-y-4 text-center">
                <label className="block text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">
                  Ease of Navigation
                </label>
                <StarRating rating={navRating} setRating={setNavRating} />
              </div>

              <PrimaryButton 
                onClick={() => setStep(2)} 
                disabled={overallRating === 0 || navRating === 0}
              >
                Next Step
              </PrimaryButton>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase tracking-[0.1em] text-slate-400 pl-4">
                  Missing Features
                </label>
                <textarea
                  placeholder="What would make running your business easier?"
                  value={missingFeatures}
                  onChange={(e) => setMissingFeatures(e.target.value)}
                  className="w-full h-24 bg-surface-muted/50 border border-border-subtle rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase tracking-[0.1em] text-slate-400 pl-4">
                  General Feedback
                </label>
                <textarea
                  placeholder="Anything else you'd like to share?"
                  value={generalFeedback}
                  onChange={(e) => setGeneralFeedback(e.target.value)}
                  className="w-full h-24 bg-surface-muted/50 border border-border-subtle rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                />
              </div>

              <div className="flex gap-4">
                <SecondaryButton onClick={() => setStep(1)} type="button">Back</SecondaryButton>
                <PrimaryButton 
                  onClick={handleSubmit} 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer / Remind Later */}
        <div className="px-8 py-4 bg-surface-muted/30 border-t border-border-subtle/50 text-center">
          <button 
            onClick={handleDismiss}
            className="text-[10px] font-mono tracking-[0.15em] text-slate-500 uppercase hover:text-slate-300 transition-colors"
          >
            Remind Me Later
          </button>
        </div>
      </div>
    </div>
  );
}
