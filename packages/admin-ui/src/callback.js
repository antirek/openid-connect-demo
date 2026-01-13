// Handle OIDC callback and extract token
export async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const session = urlParams.get('session');
  const token = urlParams.get('token'); // Токен может быть передан напрямую в query
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  if (error) {
    console.error('OAuth error:', error);
    return { error };
  }

  // Если токен передан напрямую в query (после авторизации)
  if (token) {
    localStorage.setItem('jwt_token', token);
    // Clean URL - убираем token из query
    const returnUrl = sessionStorage.getItem('return_url') || '/';
    sessionStorage.removeItem('return_url');
    const cleanUrl = returnUrl.split('?')[0]; // Убираем query параметры
    window.history.replaceState({}, document.title, cleanUrl);
    return { success: true, token };
  }

  // Если есть session, получаем токен через API
  if (session) {
    try {
      const response = await fetch(`/api/token?session=${session}`);
      const data = await response.json();
      
      if (data.token) {
        localStorage.setItem('jwt_token', data.token);
        // Clean URL
        const returnUrl = sessionStorage.getItem('return_url') || '/';
        sessionStorage.removeItem('return_url');
        const cleanUrl = returnUrl.split('?')[0]; // Убираем query параметры
        window.history.replaceState({}, document.title, cleanUrl);
        return { success: true, token: data.token };
      }
      return { error: 'Token not found in response' };
    } catch (err) {
      console.error('Token exchange failed:', err);
      return { error: err.message };
    }
  }

  return { error: 'No session or token parameter' };
}
