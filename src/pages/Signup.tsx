import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import './Signup.css';

export default function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const { data, error } = await supabase.auth.signUp({
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

      if (error) throw error;
      
      let currentSession = data.session;

      if (!currentSession) {
        setSuccessMsg('Account created. Synchronizing session...');
        
        // Auto-login fallback: Directly attempt to sign in if no session returned
        try {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (!signInError && signInData.session) {
            currentSession = signInData.session;
          } else if (signInError && signInError.message.toLowerCase().includes('confirm')) {
            setSuccessMsg('Account created! Please check your email to confirm your account before proceeding.');
          }
        } catch (e) {
          console.error('Auto-login fallback failed:', e);
        }
      }

      if (currentSession) {
        navigate('/onboarding', { replace: true });
        return;
      }

      // If we still don't have a session, show the final message
      if (successMsg && !successMsg.includes('email')) {
        setSuccessMsg('Account created successfully! Please click the button below to proceed.');
      }
      
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Signup error:', error);
      setError(error.message || 'Error creating account. Please try again.');
    } finally {
      setLoading(false);
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
                <form onSubmit={handleSignup}>
                  <div style={{textAlign: 'center', marginBottom: '20px'}}>
                    <h2 style={{fontFamily: 'var(--fd)', fontSize: '24px', fontWeight: 800}}>Create Free Account</h2>
                    <p style={{fontSize: '13px', color: 'var(--t2)', marginTop: '5px'}}>Join the exclusive beta today.</p>
                  </div>

                  {error && <div className="error-msg">{error}</div>}
                  {successMsg && (
                    <div style={{ padding: '16px', background: 'rgba(52, 211, 153, 0.1)', color: 'rgb(52, 211, 153)', fontSize: '13px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(52, 211, 153, 0.2)', textAlign: 'center' }}>
                      <div className="pulse-dot" style={{ display: 'inline-block', marginRight: '8px' }}></div>
                      {successMsg}
                      <button 
                        type="button"
                        onClick={() => navigate('/onboarding')}
                        style={{ display: 'block', width: '100%', marginTop: '12px', padding: '8px', background: 'rgb(52, 211, 153)', color: '#000', borderRadius: '6px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                      >
                        Proceed to Workspace →
                      </button>
                    </div>
                  )}

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
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
