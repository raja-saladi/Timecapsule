import Link from "next/link";
export default function NotFound(){return <main className="app-page"><div className="shell app-main"><div className="empty-state"><h1>We couldn’t find that capsule.</h1><p>It may have been removed, or it may not belong to this account.</p><Link className="btn btn-primary" href="/dashboard">Back to your capsules</Link></div></div></main>;}
