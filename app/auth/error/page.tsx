import Link from "next/link";
export default function AuthErrorPage(){return <main className="app-page"><div className="shell app-main"><div className="empty-state"><h1>We couldn’t confirm that email.</h1><p>The link may have expired. Sign in and request a fresh confirmation if needed.</p><Link href="/auth" className="btn btn-primary">Back to sign in</Link></div></div></main>;}
