import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, Lock, User, LogIn, UserPlus, KeyRound, MailX, MailPlus,
  Search, Fingerprint, RefreshCcw, Shield, Zap,
  Wallet, Plus, LogOut, ChevronRight
} from "lucide-react";
import {
  useGetOperationPricing, useRebindEmailWithCode, useRebindEmailWithOtp,
  useCancelRecoveryEmail, useAddRecoveryEmail, useCheckRecoveryEmail,
  getGetOperationPricingQueryKey, useExtractToken, useGetAuthUrls,
  getGetAuthUrlsQueryKey, useAddBalance, getGetMeQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  username: z.string().min(3, "Min 3 characters"),
  password: z.string().min(6, "Min 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Min 3 characters"),
  password: z.string().min(6, "Min 6 characters"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

const BIND_SERVICES = [
  { icon: <Search className="w-4 h-4" />, key: "check", label: "Check Email", price: "₹500", color: "#00F5FF" },
  { icon: <MailX className="w-4 h-4" />, key: "cancel", label: "Cancel Recovery", price: "₹1500", color: "#FF6B00" },
  { icon: <MailPlus className="w-4 h-4" />, key: "add", label: "Add Recovery Email", price: "₹1000", color: "#FFB800" },
  { icon: <KeyRound className="w-4 h-4" />, key: "rebindCode", label: "Rebind (Code)", price: "₹3000", color: "#00F5FF" },
  { icon: <KeyRound className="w-4 h-4" />, key: "rebindOtp", label: "Rebind (OTP)", price: "₹3000", color: "#BF00FF" },
  { icon: <Lock className="w-4 h-4" />, key: "unbindCode", label: "Unbind (Code)", price: "₹1500", color: "#FF6B00" },
  { icon: <Lock className="w-4 h-4" />, key: "unbindOtp", label: "Unbind (OTP)", price: "₹3000", color: "#FF00AA" },
  { icon: <Fingerprint className="w-4 h-4" />, key: "platforms", label: "Check Platforms", price: "₹500", color: "#FFB800" },
  { icon: <RefreshCcw className="w-4 h-4" />, key: "revoke", label: "Revoke Token", price: "₹500", color: "#00F5FF" },
];

function InfoBox({ text, steps }: { text: string; steps?: string[] }) {
  return (
    <div style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.12)', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.5rem' }}>
      <p style={{ fontSize: '0.72rem', color: '#8EC8CC', lineHeight: 1.6 }}>{text}</p>
      {steps && steps.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
          {steps.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#00D4DC', background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.18)', borderRadius: '0.3rem', padding: '0.15rem 0.4rem', whiteSpace: 'nowrap' }}>{s}</span>
              {i < steps.length - 1 && <span style={{ color: 'rgba(0,245,255,0.4)', fontSize: '0.65rem' }}>→</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BindInput({ label, placeholder, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#8A7050', marginBottom: '0.3rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '0.6rem 0.8rem', boxSizing: 'border-box',
          background: 'rgba(0,0,0,0.50)', border: '1px solid rgba(0,245,255,0.15)',
          borderRadius: '0.5rem', color: '#E2F4F5', fontSize: '0.8rem', outline: 'none',
          transition: 'border-color 0.2s',
        }}
        onFocus={e => (e.target.style.borderColor = 'rgba(0,245,255,0.40)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(0,245,255,0.15)')}
      />
    </div>
  );
}

function ResultBox({ result }: { result: { success: boolean; message: string } }) {
  return (
    <div style={{
      padding: '0.65rem 0.8rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
      background: result.success ? 'rgba(0,230,118,0.08)' : 'rgba(255,60,60,0.08)',
      border: `1px solid ${result.success ? 'rgba(0,230,118,0.25)' : 'rgba(255,60,60,0.25)'}`,
      color: result.success ? '#00E676' : '#FF5252',
    }}>
      {result.success ? '✓' : '✗'} {result.message}
    </div>
  );
}

function formatBalance(v: number) {
  if (v >= 1_000_000) return `₹${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;
}

/* ─── AUTH FORMS ─────────────────────────────────────────── */

function LoginForm({ switchToRegister }: { switchToRegister: () => void }) {
  const { login, isLoggingIn } = useAuth();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      await login(values);
      toast({ title: "Welcome back!" });
    } catch (error: any) {
      toast({ title: "Login failed", description: error?.data?.error || error.message || "An error occurred", variant: "destructive" });
    }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 0.75rem', borderRadius: '1rem', overflow: 'hidden', border: '2px solid rgba(255,107,0,0.30)', boxShadow: '0 0 24px rgba(255,107,0,0.15)' }}>
          <img src="/logo.jpg" alt="Tamilanda" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFB800', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sign In</h2>
        <p style={{ fontSize: '0.75rem', color: '#8A7050', marginTop: '0.25rem' }}>Access your bind operations panel</p>
      </div>

      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,184,0,0.3), transparent)', marginBottom: '1.5rem' }} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <User className="w-3.5 h-3.5" style={{ color: '#FF8C2A' }} />
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8A7050', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Username</label>
                </div>
                <FormControl>
                  <input
                    {...field}
                    placeholder="Enter your username"
                    style={{
                      width: '100%', padding: '0.65rem 0.9rem', boxSizing: 'border-box',
                      background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,107,0,0.18)',
                      borderRadius: '0.5rem', color: '#F5E8C0', fontSize: '0.85rem', outline: 'none',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(255,107,0,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,107,0,0.18)')}
                  />
                </FormControl>
                <FormMessage style={{ fontSize: '0.7rem', color: '#FF5252', marginTop: '0.2rem' }} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <Lock className="w-3.5 h-3.5" style={{ color: '#FF8C2A' }} />
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8A7050', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Password</label>
                </div>
                <FormControl>
                  <input
                    {...field}
                    type="password"
                    placeholder="Enter your password"
                    style={{
                      width: '100%', padding: '0.65rem 0.9rem', boxSizing: 'border-box',
                      background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,107,0,0.18)',
                      borderRadius: '0.5rem', color: '#F5E8C0', fontSize: '0.85rem', outline: 'none',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(255,107,0,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,107,0,0.18)')}
                  />
                </FormControl>
                <FormMessage style={{ fontSize: '0.7rem', color: '#FF5252', marginTop: '0.2rem' }} />
              </FormItem>
            )}
          />
          <button type="submit" disabled={isLoggingIn} className="ff-btn-primary" style={{ justifyContent: 'center', opacity: isLoggingIn ? 0.6 : 1, cursor: isLoggingIn ? 'not-allowed' : 'pointer' }}>
            <LogIn className="w-4 h-4" />
            {isLoggingIn ? "Signing in..." : "Enter Dashboard"}
          </button>
        </form>
      </Form>

      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.75rem', color: '#6A5030' }}>
        New member?{' '}
        <button onClick={switchToRegister} style={{ color: '#FF8C2A', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
          Create account
        </button>
      </p>
    </div>
  );
}

function RegisterForm({ switchToLogin }: { switchToLogin: () => void }) {
  const { register: registerUser, isRegistering } = useAuth();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "", email: "" },
  });

  const onSubmit = async (values: z.infer<typeof registerSchema>) => {
    try {
      await registerUser({ username: values.username, password: values.password, email: values.email || undefined });
      toast({ title: "Account created!" });
      switchToLogin();
    } catch (error: any) {
      toast({ title: "Registration failed", description: error?.data?.error || error.message || "An error occurred", variant: "destructive" });
    }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 0.75rem', borderRadius: '1rem', overflow: 'hidden', border: '2px solid rgba(255,107,0,0.30)', boxShadow: '0 0 24px rgba(255,107,0,0.15)' }}>
          <img src="/logo.jpg" alt="Tamilanda" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFB800', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Create Account</h2>
        <p style={{ fontSize: '0.75rem', color: '#8A7050', marginTop: '0.25rem' }}>Join Tamilanda Bind Manager</p>
      </div>

      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,184,0,0.3), transparent)', marginBottom: '1.5rem' }} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(['username', 'password', 'email'] as const).map(name => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8A7050', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {name === 'email' ? 'Email (optional)' : name}
                    </label>
                  </div>
                  <FormControl>
                    <input
                      {...field}
                      type={name === 'password' ? 'password' : name === 'email' ? 'email' : 'text'}
                      placeholder={name === 'username' ? 'Choose a username' : name === 'password' ? 'Create a password' : 'your@email.com (optional)'}
                      style={{
                        width: '100%', padding: '0.65rem 0.9rem', boxSizing: 'border-box',
                        background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,107,0,0.18)',
                        borderRadius: '0.5rem', color: '#F5E8C0', fontSize: '0.85rem', outline: 'none',
                      }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(255,107,0,0.5)')}
                      onBlur={e => (e.target.style.borderColor = 'rgba(255,107,0,0.18)')}
                    />
                  </FormControl>
                  <FormMessage style={{ fontSize: '0.7rem', color: '#FF5252', marginTop: '0.2rem' }} />
                </FormItem>
              )}
            />
          ))}
          <button type="submit" disabled={isRegistering} className="ff-btn-primary" style={{ justifyContent: 'center', opacity: isRegistering ? 0.6 : 1, cursor: isRegistering ? 'not-allowed' : 'pointer' }}>
            <UserPlus className="w-4 h-4" />
            {isRegistering ? "Creating..." : "Create Account"}
          </button>
        </form>
      </Form>

      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.75rem', color: '#6A5030' }}>
        Already have an account?{' '}
        <button onClick={switchToLogin} style={{ color: '#FF8C2A', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
          Sign in
        </button>
      </p>
    </div>
  );
}

/* ─── AUTHENTICATED BIND PANEL ───────────────────────────── */

function BindPanel() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [isAddBalanceOpen, setIsAddBalanceOpen] = useState(false);
  const [balanceCode, setBalanceCode] = useState("");

  const hasToken = !!localStorage.getItem("auth_token");
  const { data: pricing } = useGetOperationPricing({ query: { queryKey: getGetOperationPricingQueryKey(), enabled: hasToken } });
  const { data: authUrls } = useGetAuthUrls({ query: { queryKey: getGetAuthUrlsQueryKey(), enabled: hasToken } });
  const addBalanceMutation = useAddBalance();

  const [forms, setForms] = useState<Record<string, any>>({
    rebindCode: { accessToken: "", newEmail: "", otp: "", securityCode: "" },
    rebindOtp: { accessToken: "", currentEmail: "", oldOtp: "", newEmail: "", newOtp: "" },
    cancel: { accessToken: "" },
    add: { accessToken: "", email: "", otp: "", securityCode: "" },
    check: { accessToken: "" },
    unbindCode: { accessToken: "", securityCode: "" },
    unbindOtp: { accessToken: "", currentEmail: "", otp: "" },
    platforms: { accessToken: "" },
    revoke: { accessToken: "" },
    autoExtract: { url: "" },
  });
  const [steps, setSteps] = useState<{ rebindCode: 1|2; rebindOtp: 1|2|3; add: 1|2; unbindOtp: 1|2 }>({ rebindCode: 1, rebindOtp: 1, add: 1, unbindOtp: 1 });
  const [rebindOtpIdentityToken, setRebindOtpIdentityToken] = useState("");
  const [platformResult, setPlatformResult] = useState<any>(null);
  const [opResult, setOpResult] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [opLoading, setOpLoading] = useState<Record<string, boolean>>({});
  const [checkResult, setCheckResult] = useState<any>(null);
  const [autoExtractResult, setAutoExtractResult] = useState<any>(null);
  const [extractedToken, setExtractedToken] = useState("");

  const rebindCode = useRebindEmailWithCode();
  const rebindOtp = useRebindEmailWithOtp();
  const cancelEmail = useCancelRecoveryEmail();
  const addEmail = useAddRecoveryEmail();
  const checkEmail = useCheckRecoveryEmail();
  const extractToken = useExtractToken();

  const getApiBase = () => (import.meta.env.BASE_URL?.replace(/\/$/, "") || "") + "/api";
  const getAuthToken = () => localStorage.getItem("auth_token") || "";

  const apiCall = async (path: string, body: object) => {
    const res = await fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const setLoad = (key: string, val: boolean) => setOpLoading(p => ({ ...p, [key]: val }));
  const setResult = (key: string, val: { success: boolean; message: string } | null) => setOpResult(p => ({ ...p, [key]: val }));
  const setF = (form: string, field: string, value: string) => setForms(prev => ({ ...prev, [form]: { ...prev[form], [field]: value } }));

  const handleSendOtp = async (loadKey: string, stepKey: 'rebindCode' | 'rebindOtp' | 'add' | 'unbindOtp', accessToken: string, email: string) => {
    setLoad(loadKey, true);
    try {
      const data = await apiCall("/operations/send-otp", { accessToken, email });
      toast({ title: "OTP Sent!", description: data.message || `Check ${email} for the OTP.` });
      setSteps(prev => ({ ...prev, [stepKey]: 2 }) as { rebindCode: 1|2; rebindOtp: 1|2|3; add: 1|2; unbindOtp: 1|2 });
    } catch (e: any) {
      toast({ title: "Failed to Send OTP", description: e.message, variant: "destructive" });
    } finally { setLoad(loadKey, false); }
  };

  const handleAddBalance = async () => {
    if (!balanceCode) { toast({ title: "Error", description: "Enter recharge code", variant: "destructive" }); return; }
    try {
      await addBalanceMutation.mutateAsync({ data: { amount: 0, code: balanceCode } });
      toast({ title: "Balance Added!" });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setIsAddBalanceOpen(false);
      setBalanceCode("");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.data?.error || "Invalid code", variant: "destructive" });
    }
  };

  const balance = parseFloat(String(user?.balance ?? 0));

  const OP_META: Record<string, { title: string; price: string; icon: React.ReactNode }> = {
    check: { title: "Check Recovery Email", price: `₹${pricing?.checkOperations?.cost || 500}`, icon: <Search className="w-5 h-5" style={{ color: '#00F5FF' }} /> },
    cancel: { title: "Cancel Recovery Email", price: `₹${pricing?.cancelOperations?.cost || 1500}`, icon: <MailX className="w-5 h-5" style={{ color: '#FF6B00' }} /> },
    add: { title: "Add Recovery Email", price: `₹${pricing?.addOperations?.cost || 1000}`, icon: <MailPlus className="w-5 h-5" style={{ color: '#FFB800' }} /> },
    rebindCode: { title: "Rebind Email (Code)", price: `₹${pricing?.rebindOperations?.cost || 3000}`, icon: <KeyRound className="w-5 h-5" style={{ color: '#00F5FF' }} /> },
    rebindOtp: { title: "Rebind Email (OTP)", price: `₹${pricing?.rebindOperations?.cost || 3000}`, icon: <KeyRound className="w-5 h-5" style={{ color: '#BF00FF' }} /> },
    unbindCode: { title: "Unbind Email (Code)", price: `₹${pricing?.unbindWithCodeOperations?.cost || 1500}`, icon: <Lock className="w-5 h-5" style={{ color: '#FF6B00' }} /> },
    unbindOtp: { title: "Unbind Email (OTP)", price: `₹${pricing?.unbindWithOtpOperations?.cost || 3000}`, icon: <Lock className="w-5 h-5" style={{ color: '#FF00AA' }} /> },
    platforms: { title: "Check Linked Platforms", price: `₹${pricing?.platformOperations?.cost || 500}`, icon: <Fingerprint className="w-5 h-5" style={{ color: '#FFB800' }} /> },
    revoke: { title: "Revoke Token", price: `₹${pricing?.revokeOperations?.cost || 500}`, icon: <RefreshCcw className="w-5 h-5" style={{ color: '#00F5FF' }} /> },
  };

  /* ── RENDER OPERATION DETAIL PANEL ── */
  const renderOp = () => {
    if (!activeOp) return null;
    const meta = OP_META[activeOp];

    /* shared token input for simple ops */
    const tokenInput = (formKey: string) => (
      <BindInput label="Access Token" placeholder="Paste your access token here" value={forms[formKey]?.accessToken || ""} onChange={(v: string) => setF(formKey, 'accessToken', v)} />
    );

    const actionBtn = (label: string, onClick: () => void, loading: string) => (
      <button className="bind-btn" onClick={onClick} disabled={!!opLoading[loading]}>
        {opLoading[loading] ? "Processing..." : label}
      </button>
    );

    return (
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Op header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(0,245,255,0.10)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#E2F4F5', fontSize: '0.88rem' }}>{meta.title}</div>
            <div style={{ fontSize: '0.72rem', color: '#FFB800', fontWeight: 600 }}>{meta.price}</div>
          </div>
          <button onClick={() => { setActiveOp(null); setOpResult({}); }} style={{ marginLeft: 'auto', color: '#5A4030', fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>← Back</button>
        </div>

        {/* Operation-specific content */}
        {activeOp === 'check' && (
          <>
            <InfoBox text="Checks the current recovery email linked to your Free Fire account." steps={["Paste Token", "Click Check", "View Result"]} />
            {tokenInput('check')}
            {checkResult && (
              <div style={{ padding: '0.8rem', background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.8rem', lineHeight: 1.7 }}>
                {checkResult.success ? (
                  <>
                    <div style={{ color: '#00E676', fontWeight: 700, marginBottom: '0.4rem' }}>✓ Check Complete</div>
                    {checkResult.email && <div style={{ color: '#E2F4F5' }}>Email: <span style={{ color: '#00F5FF' }}>{checkResult.email}</span></div>}
                    {checkResult.isBound !== undefined && <div style={{ color: '#E2F4F5' }}>Status: <span style={{ color: checkResult.isBound ? '#00E676' : '#FF5252' }}>{checkResult.isBound ? 'Bound' : 'Not Bound'}</span></div>}
                    {checkResult.mobile && <div style={{ color: '#E2F4F5' }}>Mobile: <span style={{ color: '#00F5FF' }}>{checkResult.mobile}</span></div>}
                    {checkResult.noEmailBound && <div style={{ color: '#FFB800' }}>No recovery email bound.</div>}
                  </>
                ) : (
                  <div style={{ color: '#FF5252' }}>✗ {checkResult.error || "Check failed"}</div>
                )}
              </div>
            )}
            {actionBtn("Check Recovery Email", async () => {
              setLoad('checkSubmit', true);
              try {
                const data = await checkEmail.mutateAsync({ data: { accessToken: forms.check.accessToken } });
                setCheckResult(data.success === false
                  ? { success: false, error: data.error || "Operation failed" }
                  : { success: true, email: data.email, email_to_be: data.email_to_be, mobile: data.mobile, isBound: data.isBound, countdown: data.countdown, status: data.status, noEmailBound: data.noEmailBound });
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              } catch (e: any) {
                setCheckResult({ success: false, error: e.message });
              } finally { setLoad('checkSubmit', false); }
            }, 'checkSubmit')}
          </>
        )}

        {activeOp === 'cancel' && (
          <>
            <InfoBox text="Cancels a pending recovery email change on your Free Fire account." steps={["Paste Token", "Click Cancel", "Done ✓"]} />
            {tokenInput('cancel')}
            {opResult.cancel && <ResultBox result={opResult.cancel} />}
            {actionBtn("Cancel Recovery Email", async () => {
              setLoad('cancelSubmit', true);
              try {
                await cancelEmail.mutateAsync({ data: { accessToken: forms.cancel.accessToken } });
                setResult('cancel', { success: true, message: "Recovery email cancelled successfully!" });
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              } catch (e: any) {
                setResult('cancel', { success: false, message: e.message });
              } finally { setLoad('cancelSubmit', false); }
            }, 'cancelSubmit')}
          </>
        )}

        {activeOp === 'add' && (
          <>
            <InfoBox text="Adds a recovery email to your account. An OTP will be sent to the email." steps={["Paste Token", "Enter Email", "Enter OTP", "Enter Code", "Done ✓"]} />
            {steps.add === 1 ? (
              <>
                {tokenInput('add')}
                <BindInput label="Recovery Email" placeholder="Email to add" value={forms.add.email} onChange={(v: string) => setF('add', 'email', v)} />
              </>
            ) : (
              <>
                <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#8EC8CC' }}>
                  OTP sent to <strong>{forms.add.email}</strong>
                </div>
                <BindInput label="OTP from Email" placeholder="Enter OTP code" value={forms.add.otp} onChange={(v: string) => setF('add', 'otp', v)} />
                <BindInput label="Security Code" placeholder="Enter security code" value={forms.add.securityCode} onChange={(v: string) => setF('add', 'securityCode', v)} type="password" />
                {opResult.add && <ResultBox result={opResult.add} />}
              </>
            )}
            {steps.add === 1
              ? actionBtn("Send OTP →", () => handleSendOtp('addVerify', 'add', forms.add.accessToken, forms.add.email), 'addVerify')
              : actionBtn("Add Recovery Email", async () => {
                  setLoad('addSubmit', true);
                  try {
                    await addEmail.mutateAsync({ data: { accessToken: forms.add.accessToken, email: forms.add.email, otp: forms.add.otp, securityCode: forms.add.securityCode } });
                    setResult('add', { success: true, message: "Recovery email added successfully!" });
                    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                  } catch (e: any) {
                    setResult('add', { success: false, message: e.message });
                  } finally { setLoad('addSubmit', false); }
                }, 'addSubmit')
            }
          </>
        )}

        {activeOp === 'rebindCode' && (
          <>
            <InfoBox text="Changes the bound email using your security code." steps={["Paste Token", "New Email", "Verify OTP", "Enter Code", "Done ✓"]} />
            {steps.rebindCode === 1 ? (
              <>
                {tokenInput('rebindCode')}
                <BindInput label="New Email" placeholder="New email to bind" value={forms.rebindCode.newEmail} onChange={(v: string) => setF('rebindCode', 'newEmail', v)} />
              </>
            ) : (
              <>
                <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#8EC8CC' }}>
                  OTP sent to <strong>{forms.rebindCode.newEmail}</strong>
                </div>
                <BindInput label="OTP from New Email" placeholder="Enter OTP" value={forms.rebindCode.otp} onChange={(v: string) => setF('rebindCode', 'otp', v)} />
                <BindInput label="Security Code" placeholder="6-digit security code" value={forms.rebindCode.securityCode} onChange={(v: string) => setF('rebindCode', 'securityCode', v)} type="password" />
                {opResult.rebindCode && <ResultBox result={opResult.rebindCode} />}
              </>
            )}
            {steps.rebindCode === 1
              ? actionBtn("Send OTP →", () => handleSendOtp('rebindCodeSendOtp', 'rebindCode', forms.rebindCode.accessToken, forms.rebindCode.newEmail), 'rebindCodeSendOtp')
              : actionBtn(`Complete Rebind (${meta.price})`, async () => {
                  setLoad('rebindCodeSubmit', true);
                  try {
                    const data = await apiCall("/operations/rebind-email-code", { accessToken: forms.rebindCode.accessToken, newEmail: forms.rebindCode.newEmail, otp: forms.rebindCode.otp, securityCode: forms.rebindCode.securityCode });
                    setResult('rebindCode', { success: true, message: data.message || "Email rebound successfully!" });
                    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                  } catch (e: any) {
                    setResult('rebindCode', { success: false, message: e.message });
                  } finally { setLoad('rebindCodeSubmit', false); }
                }, 'rebindCodeSubmit')
            }
          </>
        )}

        {activeOp === 'rebindOtp' && (
          <>
            <InfoBox text="Changes the bound email using OTP from the current and new email." steps={["Paste Token", "Current Email OTP", "New Email", "New Email OTP", "Done ✓"]} />
            {steps.rebindOtp === 1 && (
              <>
                {tokenInput('rebindOtp')}
                <BindInput label="Current Email" placeholder="Currently bound email" value={forms.rebindOtp.currentEmail} onChange={(v: string) => setF('rebindOtp', 'currentEmail', v)} />
              </>
            )}
            {steps.rebindOtp === 2 && (
              <>
                <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#8EC8CC' }}>OTP sent to <strong>{forms.rebindOtp.currentEmail}</strong></div>
                <BindInput label="OTP from Current Email" placeholder="Enter OTP" value={forms.rebindOtp.oldOtp} onChange={(v: string) => setF('rebindOtp', 'oldOtp', v)} />
                <BindInput label="New Email" placeholder="New email to bind" value={forms.rebindOtp.newEmail} onChange={(v: string) => setF('rebindOtp', 'newEmail', v)} />
              </>
            )}
            {steps.rebindOtp === 3 && (
              <>
                <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#8EC8CC' }}>OTP sent to <strong>{forms.rebindOtp.newEmail}</strong></div>
                <BindInput label="OTP from New Email" placeholder="Enter OTP" value={forms.rebindOtp.newOtp} onChange={(v: string) => setF('rebindOtp', 'newOtp', v)} />
                {opResult.rebindOtp && <ResultBox result={opResult.rebindOtp} />}
              </>
            )}
            {steps.rebindOtp === 1 && actionBtn("Send OTP to Current Email →", () => handleSendOtp('rebindOtpSendOtp', 'rebindOtp', forms.rebindOtp.accessToken, forms.rebindOtp.currentEmail), 'rebindOtpSendOtp')}
            {steps.rebindOtp === 2 && actionBtn("Send OTP to New Email →", async () => {
              setLoad('rebindOtpVerify', true);
              try {
                const data = await apiCall("/operations/rebind-email-otp-step1", { accessToken: forms.rebindOtp.accessToken, currentEmail: forms.rebindOtp.currentEmail, oldOtp: forms.rebindOtp.oldOtp, newEmail: forms.rebindOtp.newEmail });
                setRebindOtpIdentityToken(data.identityToken || "");
                setSteps(p => ({ ...p, rebindOtp: 3 }));
                toast({ title: "OTP Sent!", description: `Check ${forms.rebindOtp.newEmail}` });
              } catch (e: any) {
                toast({ title: "Failed", description: e.message, variant: "destructive" });
              } finally { setLoad('rebindOtpVerify', false); }
            }, 'rebindOtpVerify')}
            {steps.rebindOtp === 3 && actionBtn(`Complete Rebind (${meta.price})`, async () => {
              setLoad('rebindOtpSubmit', true);
              try {
                const data = await apiCall("/operations/rebind-email-otp-step2", { accessToken: forms.rebindOtp.accessToken, newEmail: forms.rebindOtp.newEmail, newOtp: forms.rebindOtp.newOtp, identityToken: rebindOtpIdentityToken });
                setResult('rebindOtp', { success: true, message: data.message || "Email rebound successfully!" });
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              } catch (e: any) {
                setResult('rebindOtp', { success: false, message: e.message });
              } finally { setLoad('rebindOtpSubmit', false); }
            }, 'rebindOtpSubmit')}
          </>
        )}

        {activeOp === 'unbindCode' && (
          <>
            <InfoBox text="Unbinds the recovery email from your account using your security code." steps={["Paste Token", "Enter Code", "Done ✓"]} />
            {tokenInput('unbindCode')}
            <BindInput label="Security Code" placeholder="6-digit security code" value={forms.unbindCode.securityCode} onChange={(v: string) => setF('unbindCode', 'securityCode', v)} type="password" />
            {opResult.unbindCode && <ResultBox result={opResult.unbindCode} />}
            {actionBtn(`Unbind Email (${meta.price})`, async () => {
              setLoad('unbindCode', true);
              try {
                const data = await apiCall("/operations/unbind-email-code", { accessToken: forms.unbindCode.accessToken, securityCode: forms.unbindCode.securityCode });
                setResult('unbindCode', { success: true, message: data.message || "Email unbound successfully!" });
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              } catch (e: any) {
                setResult('unbindCode', { success: false, message: e.message });
              } finally { setLoad('unbindCode', false); }
            }, 'unbindCode')}
          </>
        )}

        {activeOp === 'unbindOtp' && (
          <>
            <InfoBox text="Unbinds the recovery email using OTP verification." steps={["Paste Token", "Current Email", "Enter OTP", "Done ✓"]} />
            {steps.unbindOtp === 1 ? (
              <>
                {tokenInput('unbindOtp')}
                <BindInput label="Current Email" placeholder="Currently bound email" value={forms.unbindOtp.currentEmail} onChange={(v: string) => setF('unbindOtp', 'currentEmail', v)} />
              </>
            ) : (
              <>
                <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#8EC8CC' }}>OTP sent to <strong>{forms.unbindOtp.currentEmail}</strong></div>
                <BindInput label="OTP from Email" placeholder="Enter OTP" value={forms.unbindOtp.otp} onChange={(v: string) => setF('unbindOtp', 'otp', v)} />
                {opResult.unbindOtp && <ResultBox result={opResult.unbindOtp} />}
              </>
            )}
            {steps.unbindOtp === 1
              ? actionBtn("Send OTP →", () => handleSendOtp('unbindOtpSend', 'unbindOtp', forms.unbindOtp.accessToken, forms.unbindOtp.currentEmail), 'unbindOtpSend')
              : actionBtn(`Unbind Email (${meta.price})`, async () => {
                  setLoad('unbindOtpSubmit', true);
                  try {
                    const data = await apiCall("/operations/unbind-email-otp", { accessToken: forms.unbindOtp.accessToken, currentEmail: forms.unbindOtp.currentEmail, otp: forms.unbindOtp.otp });
                    setResult('unbindOtp', { success: true, message: data.message || "Email unbound!" });
                    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                  } catch (e: any) {
                    setResult('unbindOtp', { success: false, message: e.message });
                  } finally { setLoad('unbindOtpSubmit', false); }
                }, 'unbindOtpSubmit')
            }
          </>
        )}

        {activeOp === 'platforms' && (
          <>
            <InfoBox text="Shows all platforms (Google, Facebook, VK, etc.) linked to your Free Fire account." steps={["Paste Token", "Check Platforms"]} />
            {tokenInput('platforms')}
            {platformResult && (
              <div style={{ padding: '0.8rem', background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '0.5rem', fontSize: '0.78rem' }}>
                <div style={{ color: '#00E676', fontWeight: 700, marginBottom: '0.5rem' }}>✓ Linked Platforms</div>
                {Array.isArray(platformResult) && platformResult.map((p: any, i: number) => (
                  <div key={i} style={{ color: '#E2F4F5', paddingBottom: '0.25rem' }}>• {p.platform || p.name || p}: {p.connected ? 'Connected' : p.value || 'Linked'}</div>
                ))}
                {!Array.isArray(platformResult) && <pre style={{ color: '#8EC8CC', fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(platformResult, null, 2)}</pre>}
              </div>
            )}
            {actionBtn(`Check Platforms (${meta.price})`, async () => {
              setLoad('platformCheck', true);
              try {
                const data = await apiCall("/operations/check-platforms", { accessToken: forms.platforms.accessToken });
                setPlatformResult(data.platforms || data);
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              } catch (e: any) {
                toast({ title: "Failed", description: e.message, variant: "destructive" });
              } finally { setLoad('platformCheck', false); }
            }, 'platformCheck')}
          </>
        )}

        {activeOp === 'revoke' && (
          <>
            <InfoBox text="Revokes and invalidates the provided access token for security purposes." steps={["Paste Token", "Revoke"]} />
            {tokenInput('revoke')}
            {opResult.revoke && <ResultBox result={opResult.revoke} />}
            {actionBtn(`Revoke Token (${meta.price})`, async () => {
              setLoad('revokeToken', true);
              try {
                const data = await apiCall("/operations/revoke-token", { accessToken: forms.revoke.accessToken });
                setResult('revoke', { success: true, message: data.message || "Token revoked!" });
                queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              } catch (e: any) {
                setResult('revoke', { success: false, message: e.message });
              } finally { setLoad('revokeToken', false); }
            }, 'revokeToken')}
          </>
        )}
      </div>
    );
  };

  /* ── AUTO EXTRACT TAB ── */
  const renderAutoExtract = () => (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.18)', borderRadius: '0.5rem', fontSize: '0.72rem', color: '#D4A070', lineHeight: 1.6 }}>
        Paste the Garena login callback URL to automatically extract the access token from it.
      </div>
      {authUrls && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8A7050', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Login URL (open in browser)</label>
          {(Array.isArray(authUrls) ? authUrls : []).map((u: { platform: string; url: string }, i: number) => (
            <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '0.5rem 0.75rem', background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.12)', borderRadius: '0.5rem', color: '#00D4DC', fontSize: '0.72rem', wordBreak: 'break-all', textDecoration: 'none' }}>
              {u.platform}: {u.url}
            </a>
          ))}
        </div>
      )}
      <BindInput label="Callback URL" placeholder="Paste the callback URL here..." value={forms.autoExtract.url} onChange={(v: string) => setF('autoExtract', 'url', v)} />
      {extractedToken && (
        <div style={{ padding: '0.8rem', background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.20)', borderRadius: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#00E676', marginBottom: '0.4rem' }}>✓ Token Extracted</div>
          <code style={{ fontSize: '0.65rem', color: '#8EC8CC', wordBreak: 'break-all', display: 'block' }}>{extractedToken}</code>
          <button onClick={() => { navigator.clipboard.writeText(extractedToken); toast({ title: "Copied!" }); }}
            style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#FF8C2A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Copy Token
          </button>
        </div>
      )}
      {autoExtractResult && !extractedToken && (
        <div style={{ color: '#FF5252', fontSize: '0.78rem' }}>✗ {autoExtractResult.error || "Extraction failed"}</div>
      )}
      <button className="bind-btn" disabled={!!opLoading.autoExtract} onClick={async () => {
        setLoad('autoExtract', true);
        try {
          const data = await extractToken.mutateAsync({ data: { callbackUrl: forms.autoExtract.url } });
          if (data.token) { setExtractedToken(data.token); setAutoExtractResult(null); }
          else { setAutoExtractResult({ error: "No token found" }); }
        } catch (e: any) {
          setAutoExtractResult({ error: e.message });
        } finally { setLoad('autoExtract', false); }
      }}>
        {opLoading.autoExtract ? "Extracting..." : "Extract Token"}
      </button>
    </div>
  );

  const [tab, setTab] = useState<'ops' | 'token'>('ops');
  type TabKey = 'ops' | 'token';

  return (
    <div style={{ background: '#060300', minHeight: '100vh' }}>
      <PublicNavbar />

      {/* Bind header */}
      <div style={{ padding: '2rem 1.5rem 1.5rem', textAlign: 'center', borderBottom: '1px solid rgba(0,245,255,0.08)', background: 'linear-gradient(180deg, rgba(0,245,255,0.04) 0%, transparent 100%)' }}>
        <span className="ff-section-badge" style={{ display: 'inline-flex', marginBottom: '0.75rem', color: '#00F5FF', borderColor: 'rgba(0,245,255,0.25)', background: 'rgba(0,245,255,0.08)' }}>
          <Link2 className="w-3 h-3" /> Bind Operations
        </span>
        <h1 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 800, color: '#fff', marginBottom: '0.3rem' }}>
          Bind Manager Dashboard
        </h1>
        <p style={{ fontSize: '0.78rem', color: '#8A7050' }}>Premium • Secure • Instant</p>

        {/* User bar */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.9rem', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.20)', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 600, color: '#FFB800' }}>
            <Wallet className="w-3.5 h-3.5" /> {formatBalance(balance)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8A7050', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B00, #FFB800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff' }}>
              {user?.username[0].toUpperCase()}
            </div>
            {user?.username}
          </div>
          <button onClick={() => setIsAddBalanceOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.9rem', background: 'rgba(255,107,0,0.10)', border: '1px solid rgba(255,107,0,0.25)', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, color: '#FF8C2A', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <Plus className="w-3 h-3" /> Add Balance
          </button>
          <button onClick={() => logout()} title="Logout" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,50,50,0.20)', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 600, color: '#FF5252', cursor: 'pointer' }}>
            <LogOut className="w-3 h-3" /> Logout
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '1.25rem 1.5rem 0' }}>
        {[{ key: 'ops', label: 'Operations' }, { key: 'token', label: 'Extract Token' }].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as TabKey); setActiveOp(null); }}
            style={{
              padding: '0.45rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
              background: tab === t.key ? 'rgba(0,245,255,0.10)' : 'transparent',
              border: `1px solid ${tab === t.key ? 'rgba(0,245,255,0.30)' : 'rgba(0,245,255,0.10)'}`,
              color: tab === t.key ? '#00F5FF' : '#6A7080',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 680, margin: '1.25rem auto', padding: '0 1.5rem 3rem' }}>
        {tab === 'token' ? (
          <div style={{ background: 'linear-gradient(160deg, #08050A 0%, #060408 100%)', border: '1px solid rgba(0,245,255,0.12)', borderRadius: '1rem', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(0,245,255,0.08)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap className="w-4 h-4" style={{ color: '#FF8C2A' }} />
              <span style={{ fontWeight: 700, color: '#E2F4F5', fontSize: '0.85rem' }}>Auto Token Extract</span>
            </div>
            {renderAutoExtract()}
          </div>
        ) : activeOp ? (
          <div style={{ background: 'linear-gradient(160deg, #08050A 0%, #060408 100%)', border: '1px solid rgba(0,245,255,0.12)', borderRadius: '1rem', overflow: 'hidden' }}>
            {renderOp()}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {BIND_SERVICES.map(svc => (
              <button key={svc.key} onClick={() => setActiveOp(svc.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.9rem 1.1rem',
                  background: 'linear-gradient(135deg, #0C0608 0%, #080408 100%)',
                  border: '1px solid rgba(0,245,255,0.10)',
                  borderRadius: '0.75rem',
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,245,255,0.25)'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #0E0810 0%, #0A060C 100%)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,245,255,0.10)'; (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #0C0608 0%, #080408 100%)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '0.6rem', background: `rgba(${svc.color === '#00F5FF' ? '0,245,255' : svc.color === '#FF6B00' ? '255,107,0' : svc.color === '#FFB800' ? '255,184,0' : svc.color === '#BF00FF' ? '191,0,255' : '255,0,170'},0.10)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: svc.color }}>{svc.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#D4C0A0', fontSize: '0.82rem' }}>{svc.label}</div>
                    <div className="ff-price-tag" style={{ marginTop: '0.15rem', fontSize: '0.65rem' }}>{svc.price}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: '#4A3820', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Balance Dialog */}
      <Dialog open={isAddBalanceOpen} onOpenChange={setIsAddBalanceOpen}>
        <DialogContent style={{ background: '#0E0800', border: '1px solid rgba(255,107,0,0.20)', maxWidth: 380, margin: '1rem' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#FFB800', fontWeight: 700 }}>Add Balance</DialogTitle>
            <DialogDescription style={{ fontSize: '0.78rem', color: '#8A7050' }}>Enter your recharge code</DialogDescription>
          </DialogHeader>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,184,0,0.3), transparent)', margin: '0.5rem 0' }} />
          <div style={{ padding: '0.5rem 0' }}>
            <Label style={{ fontSize: '0.72rem', color: '#8A7050', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recharge Code</Label>
            <input value={balanceCode} onChange={e => setBalanceCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddBalance()}
              placeholder="e.g. TAMILANDA500"
              style={{ width: '100%', marginTop: '0.4rem', padding: '0.65rem 0.9rem', boxSizing: 'border-box', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,107,0,0.18)', borderRadius: '0.5rem', color: '#F5E8C0', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleAddBalance} disabled={addBalanceMutation.isPending} className="luxury-btn w-full">
              {addBalanceMutation.isPending ? "Processing..." : "Add Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── MAIN BIND PAGE ─────────────────────────────────────── */

export default function BindPage() {
  const { user, isLoading, error } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  if (user) return <BindPanel />;

  /* Public view — pricing + login/register card */
  return (
    <div style={{ background: '#060300', minHeight: '100vh', color: '#F5E8C0' }}>
      <PublicNavbar />

      {/* Header */}
      <section style={{ padding: '3rem 1.5rem 2rem', textAlign: 'center', borderBottom: '1px solid rgba(255,107,0,0.08)', background: 'linear-gradient(180deg, rgba(0,245,255,0.03) 0%, transparent 100%)' }}>
        <span className="ff-section-badge" style={{ display: 'inline-flex', marginBottom: '0.75rem', color: '#00F5FF', borderColor: 'rgba(0,245,255,0.25)', background: 'rgba(0,245,255,0.08)' }}>
          <Link2 className="w-3 h-3" /> Bind Services
        </span>
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.5rem)', fontWeight: 900, color: '#fff', marginBottom: '0.5rem' }}>
          Account Bind Manager
        </h1>
        <p style={{ color: '#8A7050', fontSize: '0.85rem' }}>
          Premium Free Fire email bind, unbind & recovery operations
        </p>
      </section>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2.5rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>

        {/* Services listing */}
        <div>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFB800', marginBottom: '1rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield className="w-4 h-4" /> Available Operations
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {BIND_SERVICES.map(svc => (
              <div key={svc.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 1rem', background: 'rgba(255,107,0,0.03)', border: '1px solid rgba(255,107,0,0.12)', borderRadius: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: svc.color }}>{svc.icon}</span>
                  <span style={{ fontSize: '0.8rem', color: '#D4B483' }}>{svc.label}</span>
                </div>
                <span className="ff-price-tag">{svc.price}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.12)', borderRadius: '0.75rem', fontSize: '0.75rem', color: '#6A8088', lineHeight: 1.7 }}>
            <div style={{ color: '#00D4DC', fontWeight: 700, marginBottom: '0.3rem' }}>How it works</div>
            Login → Get your Access Token → Choose Operation → Complete & Done!
          </div>
        </div>

        {/* Auth card */}
        <div style={{ background: 'linear-gradient(160deg, #120A02 0%, #0E0800 100%)', border: '1px solid rgba(255,107,0,0.18)', borderRadius: '1.25rem', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
          {/* Top accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #FF6B00 30%, #FFB800 70%, transparent)' }} />

          {authMode === 'login'
            ? <LoginForm switchToRegister={() => setAuthMode('register')} />
            : <RegisterForm switchToLogin={() => setAuthMode('login')} />
          }
        </div>
      </div>
    </div>
  );
}
