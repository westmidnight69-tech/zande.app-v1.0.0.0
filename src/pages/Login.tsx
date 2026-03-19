import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import './Signup.css'; // Reusing the signup styles

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Success, redirect to dashboard
      navigate('/');
      
    } catch (err: any) {
      setError(err.message || 'Invalid login credentials.');
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
            <span className="nav-pill">Welcome back</span>
            <Link className="nav-cta" to="/signup">Create Account</Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="wrap">
          <div className="hero-grid" style={{gridTemplateColumns: '1fr', justifyItems: 'center'}}>
            
            {/* CENTER FORM */}
            <div style={{width: '100%', maxWidth: '420px'}}>
              <div className="final-form-box" style={{margin: '0 auto'}}>
                <form onSubmit={handleLogin}>
                  <div style={{textAlign: 'center', marginBottom: '20px'}}>
                    <h2 style={{fontFamily: 'var(--fd)', fontSize: '24px', fontWeight: 800}}>Sign In</h2>
                    <p style={{fontSize: '13px', color: 'var(--t2)', marginTop: '5px'}}>Access your Zande dashboard.</p>
                  </div>

                  {error && <div className="error-msg">{error}</div>}

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
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px'}}>
                      <label style={{marginBottom: 0}}>Password</label>
                      <Link to="#" style={{fontSize: '10px', color: 'var(--cy)', textDecoration: 'none'}}>Forgot Password?</Link>
                    </div>
                    <input 
                      type="password" 
                      className="fi2" 
                      placeholder="••••••••" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="submit-btn" disabled={loading}>
                    {loading ? 'Signing In...' : 'Sign In To Dashboard →'}
                  </button>

                  <div className="form-legal">
                    Don't have an account? <Link to="/signup">Sign up here</Link>.
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
