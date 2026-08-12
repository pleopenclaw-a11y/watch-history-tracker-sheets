import type { VercelRequest,VercelResponse } from '@vercel/node';
import { oauth,json,method,setSession,clearSession,session } from '../_lib/auth.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.url?.includes('/logout')){if(!method(req,res,'POST'))return;clearSession(res);return json(res,200,{ok:true})}
 if(req.url?.includes('/me')){if(!method(req,res,'GET'))return;const s=session(req);return json(res,200,{authenticated:!!s,user:s?{id:s.sub,email:s.email,name:s.name}:null})}
 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return json(res,503,{error:'oauth_not_configured'});
 if(req.url?.includes('/callback')){if(!method(req,res,'GET'))return;try{const code=String(req.query.code||'');if(!code)return json(res,400,{error:'missing_code'});const client=oauth(),{tokens}=await client.getToken(code);client.setCredentials(tokens);const {data}=await google.oauth2({version:'v2',auth:client}).userinfo.get();if(!tokens.refresh_token)return json(res,400,{error:'missing_refresh_token'});setSession(res,{sub:data.id!,email:data.email!,name:data.name,refreshToken:tokens.refresh_token});return res.redirect('/')}catch(e){return json(res,500,{error:'oauth_callback_failed'})}}
 if(!method(req,res,'GET'))return;return res.redirect(oauth().generateAuthUrl({access_type:'offline',prompt:'consent',scope:['openid','email','profile','https://www.googleapis.com/auth/drive.file']}));
}
