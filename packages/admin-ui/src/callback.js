// Handle OIDC callback and extract token
// Provider передает токен напрямую в query параметре ?token=...
export async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const error = urlParams.get('error');

  if (error) {
    console.error('OAuth error:', error);
    return { error };
  }

  // Токен передается напрямую в query параметре от provider
  if (token) {
    localStorage.setItem('jwt_token', token);
    // Clean URL - убираем token из query
    const returnUrl = sessionStorage.getItem('return_url') || '/';
    sessionStorage.removeItem('return_url');
    const cleanUrl = returnUrl.split('?')[0]; // Убираем query параметры
    window.history.replaceState({}, document.title, cleanUrl);
    return { success: true, token };
  }

  return { error: 'No token parameter in callback' };
}
