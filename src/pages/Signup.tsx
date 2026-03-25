import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import './Signup.css';

export default function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignedUp, setIsSignedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Redirect if already logged in (or just signed up)
  useEffect(() => {
    if (session) {
      navigate('/onboarding', { replace: true });
    }
  }, [session, navigate]);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isSignedUp) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const signupTimeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setError('The request is taking longer than expected. Please check your internet connection or try again in a few minutes. (Note: Account creation may still be processing in the background)');
      }
    }, 20000); // 20 second timeout for the UI state

    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: company
          }
        }
      });

      clearTimeout(signupTimeout);

      if (signupError) {
        if (signupError.message.includes('rate limit')) {
          throw new Error('You have requested too many signups in a short period. Please wait an hour before trying again.');
        }
        throw signupError;
      }
      
      const currentSession = data.session;

      if (currentSession) {
        setIsSignedUp(true);
        setSuccessMsg('Signup successful! Redirecting to workspace...');
        // We let the useEffect or a delayed navigate handle the move to /onboarding
        setTimeout(() => {
          navigate('/onboarding', { replace: true });
        }, 1500);
        return;
      }

      // If no session, it means email verification is likely ON
      setIsSignedUp(true);
      setSuccessMsg('Account created! Please check your email to confirm your account before proceeding.');
      
    } catch (err: unknown) {
      clearTimeout(signupTimeout);
      const error = err as Error;
      console.error('Signup error:', error);
      setError(error.message || 'Error creating account. Please try again.');
    } finally {
      if (!isSignedUp) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="landing-body">
      <div className="glow"></div>
      
      <nav className="landing-nav">
        <div className="nav-in">
          <Link className="logo" to="/">Zande<div className="logo-dot"></div></Link>
          <div className="nav-r">
            <span className="nav-pill">Beta testing access</span>
            <Link className="nav-cta" to="/login">Sign In Instead</Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            {/* LEFT COPY */}
            <div>
              <div className="eyebrow">
                <div className="pulse-dot"></div>
                Built for SA Businesses · Exclusive beta
              </div>
              <h1 className="hero-h">
                Your business books,<br/>
                done for you —<br/>
                <span className="grad">automatically.</span>
              </h1>
              <p className="hero-sub">
                Zande handles every invoice, expense, bank transaction and tax calculation for your business — automatically. <strong>No spreadsheets. No missing receipts. No accountant required.</strong>
              </p>
            </div>

            {/* RIGHT FORM */}
            <div>
              <div className="final-form-box">
                <div style={{textAlign: 'center', marginBottom: '20px'}}>
                  <h2 style={{fontFamily: 'var(--fd)', fontSize: '24px', fontWeight: 800}}>Create Free Account</h2>
                  <p style={{fontSize: '13px', color: 'var(--t2)', marginTop: '5px'}}>Join the exclusive beta today.</p>
                </div>

                {error && <div className="error-msg">{error}</div>}
                
                {successMsg && (
                  <div style={{ padding: '24px', background: 'rgba(52, 211, 153, 0.1)', color: 'rgb(52, 211, 153)', fontSize: '14px', borderRadius: '16px', marginBottom: '10px', border: '1px solid rgba(52, 211, 153, 0.2)', textAlign: 'center' }}>
                    <div className="pulse-dot" style={{ display: 'inline-block', marginBottom: '12px' }}></div>
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>{successMsg}</div>
                    <p style={{ color: 'var(--t2)', fontSize: '12px', marginBottom: '16px' }}>
                      {successMsg.includes('email') ? 'Please confirm your email to continue.' : 'Setting up your secure workspace...'}
                    </p>
                    <button 
                      type="button"
                      onClick={() => navigate('/onboarding')}
                      style={{ display: 'block', width: '100%', padding: '12px', background: 'rgb(52, 211, 153)', color: '#000', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}
                    >
                      Proceed Now →
                    </button>
                  </div>
                )}

                {!isSignedUp && (
                  <form onSubmit={handleSignup}>
                    <div className="fg2">
                      <div className="fg" style={{marginBottom: 0}}>
                        <label>First Name</label>
                        <input 
                          type="text" 
                          className="fi2" 
                          placeholder="Sipho" 
                          required 
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </div>
                      <div className="fg" style={{marginBottom: 0}}>
                        <label>Last Name</label>
                        <input 
                          type="text" 
                          className="fi2" 
                          placeholder="Khumalo" 
                          required 
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="fg">
                      <label>Company Name</label>
                      <input 
                        type="text" 
                        className="fi2" 
                        placeholder="Acme Trading (Pty) Ltd" 
                        required 
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </div>

                    <div className="fg">
                      <label>Email Address</label>
                      <input 
                        type="email" 
                        className="fi2" 
                        placeholder="sipho@acmetrading.co.za" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    <div className="fg">
                      <label>Password</label>
                      <input 
                        type="password" 
                        className="fi2" 
                        placeholder="••••••••" 
                        required 
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading}>
                      {loading ? 'Creating Account...' : 'Create Free Account →'}
                    </button>

                    <div className="form-legal">
                      By registering, you agree to our <Link to="#">Terms of Service</Link> and <Link to="#">Privacy Policy</Link>.
                    </div>
                  </form>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
