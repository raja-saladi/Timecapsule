"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteCapsule } from "@/app/actions/capsules";
export function DeleteCapsuleButton({id,title}:{id:string;title:string}){const [busy,setBusy]=useState(false);const router=useRouter();async function remove(){if(!window.confirm("Delete “"+title+"”? This also removes its stored media and cannot be undone."))return;setBusy(true);const result=await deleteCapsule(id);setBusy(false);if(result.ok)router.refresh();else window.alert(result.message);}return <button type="button" aria-label={"Delete "+title} title="Delete" className="icon-button" disabled={busy} onClick={remove}><Trash2 size={14}/></button>;}
