"use client";
import Link from "next/link";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="app-page"><div className="shell app-main"><div className="empty-state"><h1>Something interrupted this moment.</h1><p>Try again. If the problem continues, return to your capsules and open it from there.</p><button className="btn btn-primary" onClick={reset}>Try again</button> <Link href="/dashboard" className="btn btn-quiet">Dashboard</Link></div></div></main>;}
