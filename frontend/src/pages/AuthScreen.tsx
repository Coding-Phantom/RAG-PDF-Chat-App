import { useState } from 'react'
import { login, register, setToken } from '../api'

export default function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (isRegister && confirmPassword !== password) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      if (isRegister) {
        await register(username, password)
        const result = await login(username, password)
        setToken(result.access_token)
      } else {
        const result = await login(username, password)
        setToken(result.access_token)
      }

      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded bg-gray-800 p-8"
      >
        <h1 className="mb-6 text-center font-mono text-3xl font-bold text-red-200">
          PDFInsight
        </h1>

        {error ? (
          <div className="mb-4 rounded border border-red-500 bg-red-950 px-4 py-3 font-mono text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded border border-gray-700 bg-gray-900 p-3 font-mono text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded border border-gray-700 bg-gray-900 p-3 font-mono text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
        />

        {isRegister ? (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mb-4 w-full rounded border border-gray-700 bg-gray-900 p-3 font-mono text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
          />
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded bg-blue-600 py-3 font-mono font-semibold text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400"
        >
          {loading ? 'Please wait...' : isRegister ? 'Register' : 'Log In'}
        </button>

        <p className="mt-4 text-center font-mono text-sm text-gray-400">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-blue-400 hover:underline"
          >
            {isRegister ? 'Log in' : 'Register'}
          </button>
        </p>
      </form>
    </main>
  )
}
