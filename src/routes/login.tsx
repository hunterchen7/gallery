import { createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  attemptLogin,
  getStoredAuthKey,
  isAuthenticated,
  clearAuthKey,
} from "~/lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [isLoggedIn, setIsLoggedIn] = createSignal(false);

  onMount(() => {
    if (isAuthenticated()) {
      setIsLoggedIn(true);
    }
  });

  async function handleLogin(e: Event) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Fetch the encrypted key from the server
      const configRes = await fetch("/api/auth-config");
      const config = await configRes.json();

      if (!config.encryptedKey) {
        setError("Auth not configured on server");
        return;
      }

      // Attempt to decrypt and login
      const success = await attemptLogin(config.encryptedKey, password());

      if (success) {
        // Verify the decrypted key
        const key = getStoredAuthKey();
        const verifyRes = await fetch("/api/auth-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        const verifyData = await verifyRes.json();

        if (verifyData.valid) {
          setIsLoggedIn(true);
          setPassword("");
        } else {
          clearAuthKey();
          setError("Invalid password");
        }
      } else {
        setError("Decryption failed - wrong password");
      }
    } catch (e) {
      setError("Login failed");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAuthKey();
    setIsLoggedIn(false);
  }

  return (
    <div class="min-h-screen bg-black flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <Show
          when={!isLoggedIn()}
          fallback={
            <div class="bg-zinc-900 rounded-lg p-8 text-center">
              <div class="text-green-500 text-6xl mb-4">✓</div>
              <h1 class="text-2xl font-bold text-white mb-4">Logged In</h1>
              <p class="text-zinc-400 mb-6">You have admin access.</p>
              <div class="flex gap-4 justify-center">
                <button
                  onClick={() => navigate("/")}
                  class="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Go to Gallery
                </button>
                <button
                  onClick={handleLogout}
                  class="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          }
        >
          <form onSubmit={handleLogin} class="bg-zinc-900 rounded-lg p-8">
            <h1 class="text-2xl font-bold text-white mb-6 text-center">
              Admin Login
            </h1>

            <div class="mb-4">
              <label class="block text-zinc-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="Enter password"
                class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                autofocus
              />
            </div>

            <Show when={error()}>
              <p class="text-red-500 text-sm mb-4">{error()}</p>
            </Show>

            <button
              type="submit"
              disabled={loading() || !password()}
              class="w-full py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading() ? "Logging in..." : "Login"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              class="w-full mt-3 py-3 text-zinc-400 hover:text-white transition-colors"
            >
              Back to Gallery
            </button>
          </form>
        </Show>
      </div>
    </div>
  );
}
