'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Pill, Lock, Mail, AlertCircle } from 'lucide-react'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('admin@pharmacy.pk')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const r = await login(email, password)
    if (!r.ok) setError(r.error || 'Login failed')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <Pill className="h-8 w-8" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-foreground">Shifa Medical Store</h1>
            <p className="text-sm text-muted-foreground">Pharmacy Management System</p>
          </div>

          <Card className="border shadow-xl">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Enter your credentials to access the system</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/30">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" autoComplete="email" required
                      className="pl-9" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type="password" autoComplete="current-password" required
                      className="pl-9" value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Signing in…' : 'Sign In'}
                </Button>
              </form>

              <div className="mt-6 p-3 rounded-md bg-muted text-xs space-y-1.5">
                <div className="font-semibold text-foreground">Demo accounts:</div>
                <div className="flex justify-between"><span>Admin:</span> <code>admin@pharmacy.pk</code> / <code>admin123</code></div>
                <div className="flex justify-between"><span>Manager:</span> <code>manager@pharmacy.pk</code> / <code>manager123</code></div>
                <div className="flex justify-between"><span>Cashier:</span> <code>cashier@pharmacy.pk</code> / <code>cashier123</code></div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Shifa Medical Store. Pharmacy Management System.
          </div>
        </div>
      </div>
    </div>
  )
}
