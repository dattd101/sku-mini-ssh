export type RemoteFile = { name:string; isDirectory:boolean; isFile:boolean; size:number; mtime:number; mode:number };
export type ClientMessage =
  | {type:'connect'; host:string; port:number; username:string; password?:string; privateKey?:string; passphrase?:string; cols:number; rows:number}
  | {type:'input'; data:string} | {type:'resize'; cols:number; rows:number}
  | {type:'list'; id:string; path:string} | {type:'mkdir'; id:string; path:string}
  | {type:'rename'; id:string; from:string; to:string} | {type:'delete'; id:string; path:string; isDirectory:boolean}
  | {type:'download'; id:string; path:string} | {type:'upload-start'; id:string; path:string; size:number}
  | {type:'upload-chunk'; id:string; data:string} | {type:'upload-end'; id:string}
  | {type:'disconnect'};
export type ServerMessage =
  | {type:'connected'; fingerprint:string; expiresAt:number} | {type:'terminal'; data:string} | {type:'closed'; reason?:string}
  | {type:'response'; id:string; ok:boolean; data?:unknown; error?:string}
  | {type:'download-start'; id:string; name:string; size:number} | {type:'download-chunk'; id:string; data:string} | {type:'download-end'; id:string}
  | {type:'upload-progress'; id:string; done:number; total:number};
