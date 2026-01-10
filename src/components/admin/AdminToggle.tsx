import { createSignal, Show, onMount } from "solid-js";
import {
  isAuthenticated,
  clearAuthKey,
  attemptLogin,
  getStoredAuthKey,
} from "~/lib/auth";
import { Settings, LogOut, X, KeyRound } from "lucide-solid";

interface AdminToggleProps {
  onAdminModeChange?: (enabled: boolean) => void;
}

export function AdminToggle(props: AdminToggleProps) {
  const [isAdmin, setIsAdmin] = createSignal(false);
  const [showLogin, setShowLogin] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    // Check if already authenticated
    if (isAuthenticated()) {
      // Verify the stored key is still valid
      verifyStoredKey();
    }
  });

  async function verifyStoredKey() {
    const key = getStoredAuthKey();
    if (!key) return;

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.valid) {
        setIsAdmin(true);
        props.onAdminModeChange?.(true);
      } else {
        clearAuthKey();
      }
    } catch {
      // If verification fails, don't enable admin mode
    }
  }

  async function handleLogin() {
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
          setIsAdmin(true);
          setShowLogin(false);
          setPassword("");
          props.onAdminModeChange?.(true);
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
    setIsAdmin(false);
    props.onAdminModeChange?.(false);
  }

  return (
    <>
      {/* Floating toggle button */}
      <div class="fixed bottom-4 right-4 z-50">
        <Show
          when={isAdmin()}
          fallback={
            <button
              onClick={() => setShowLogin(true)}
              class="p-3 bg-violet-900/80 hover:bg-violet-800 rounded-full shadow-lg backdrop-blur-sm transition-colors"
              title="Admin Login"
            >
              <KeyRound class="w-5 h-5 text-violet-300" />
            </button>
          }
        >
          <div class="flex gap-2">
            <a
              href="/admin"
              class="p-3 bg-violet-600 hover:bg-violet-500 rounded-full shadow-lg transition-colors"
              title="Admin Settings"
            >
              <Settings class="w-5 h-5 text-white" />
            </a>
            <button
              onClick={handleLogout}
              class="p-3 bg-red-900/80 hover:bg-red-800 rounded-full shadow-lg backdrop-blur-sm transition-colors"
              title="Logout"
            >
              <LogOut class="w-5 h-5 text-red-300" />
            </button>
          </div>
        </Show>
      </div>

      {/* Login modal */}
      <Show when={showLogin()}>
        <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-zinc-900 border border-violet-800 rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-medium text-violet-200">Admin Login</h2>
              <button
                onClick={() => setShowLogin(false)}
                class="p-1 hover:bg-zinc-800 rounded"
              >
                <X class="w-5 h-5 text-violet-400" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              <input
                type="password"
                placeholder="Enter password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                class="w-full px-4 py-2 bg-zinc-800 border border-violet-700 rounded text-violet-100 placeholder-violet-500 focus:outline-none focus:border-violet-500"
                autofocus
              />

              <Show when={error()}>
                <p class="text-red-400 text-sm mt-2">{error()}</p>
              </Show>

              <button
                type="submit"
                disabled={loading()}
                class="w-full mt-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
              >
                {loading() ? "Logging in..." : "Login"}
              </button>
            </form>
          </div>
        </div>
      </Show>
    </>
  );
}
