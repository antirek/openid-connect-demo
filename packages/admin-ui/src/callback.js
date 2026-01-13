// Handle OIDC callback and extract token
export function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const session = urlParams.get('session');
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  if (error) {
    console.error('OAuth error:', error);
    return { error };
  }

  if (session) {
    // Get token from client API
    return fetch(`http://localhost:3001/api/token?session=${session}`)
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          localStorage.setItem('jwt_token', data.token);
          // Clean URL
          const returnUrl = sessionStorage.getItem('return_url') || '/';
          sessionStorage.removeItem('return_url');
          window.history.replaceState({}, document.title, returnUrl);
          return { success: true, token: data.token };
        }
        return { error: 'Token not found in response' };
      })
      .catch(err => {
        console.error('Token exchange failed:', err);
        return { error: err.message };
      });
  }

  return { error: 'No session parameter' };
}
