import crypto from 'node:crypto';
import { google } from 'googleapis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const secret=()=>process.env.SESSION_SECRET||'development-only-change-me';
const key=()=>crypto.createHash('sha256').update(secret()).digest();
export type Session={sub:string;email:string;name?:string;refreshToken:string};
export function oauth(){return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI||'http://localhost:3000/api/auth/callback')}
export function setSession(res:VercelResponse,s:Session){const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key(),iv); const body=Buffer.concat([c.update(JSON.stringify(s)),c.final()]); const value=[iv, c.getAuthTag(),body].map(x=>x.toString('base64url')).join('.'); res.setHeader('Set-Cookie',`watch_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`)}
export function clearSession(res:VercelResponse){res.setHeader('Set-Cookie','watch_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')}
export function session(req:VercelRequest){try{const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('watch_session='))?.slice(14); if(!raw)return null; const [i,t,b]=raw.split('.'); const d=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(i,'base64url')); d.setAuthTag(Buffer.from(t,'base64url')); return JSON.parse(Buffer.concat([d.update(Buffer.from(b,'base64url')),d.final()]).toString()) as Session}catch{return null}}
export function json(res:VercelResponse,status:number,data:unknown){res.status(status).json(data)}
export function method(req:VercelRequest,res:VercelResponse,m:string){if(req.method!==m){res.setHeader('Allow',m);json(res,405,{error:'method_not_allowed'});return false}return true}
