import Link from "next/link";
import { Orbit } from "lucide-react";
export function Brand() { return <Link href="/" className="brand" aria-label="Time Capsule home"><span className="brand-mark"><Orbit size={18}/></span><span className="brand-word">time capsule</span></Link>; }
