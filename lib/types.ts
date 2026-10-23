export type Capsule={id:string;user_id:string;title:string;description:string|null;unlock_at:string;time_zone:string;visibility:"private"|"recipient";recipient_name:string|null;created_at:string;updated_at:string};
export type CapsuleContent={capsule_id:string;letter:string|null};
export type CapsuleMedia={id:string;capsule_id:string;storage_key:string;file_name:string;mime_type:string;size_bytes:number;created_at:string};
