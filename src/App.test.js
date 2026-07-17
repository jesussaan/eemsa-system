import { render, screen } from '@testing-library/react';

// Sin sesion real ni tablas reales -- solo probamos que la app arranca y,
// sin login, cae en la pantalla de Login (nunca deberia tronar antes de eso).
jest.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => ({ select: jest.fn(() => Promise.resolve({ data: [], error: null })) })),
    channel: jest.fn(() => {
      const chain = { on: jest.fn(() => chain), subscribe: jest.fn(() => chain) };
      return chain;
    }),
    removeChannel: jest.fn(),
  },
}));

test('sin sesion, la app arranca y muestra la pantalla de login', async () => {
  // require en vez de import de nivel de modulo -- asegura que el mock de
  // supabase ya este activo antes de que App.js (y lib/auth.js) lo importen.
  const App = require('./App').default;
  render(<App />);
  expect(await screen.findByText(/Iniciar sesión/i)).toBeInTheDocument();
});
