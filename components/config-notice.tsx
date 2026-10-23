import Link from "next/link";
import { Settings2 } from "lucide-react";
export function ConfigNotice(){return <section className="empty-state"><span className="empty-icon"><Settings2 size={19}/></span><h2>Connect your Supabase project</h2><p>Authentication and private storage need your project URL and publishable key. Copy .env.example to .env.local, add the keys, then restart the dev server.</p><Link href="/" className="btn btn-quiet">Back to home</Link></section>;}
