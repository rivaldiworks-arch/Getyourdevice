// Browser test for the admin login card: the show/hide password toggle, requesting a
// reset link ("Lupa password"), and setting a new password from the Supabase recovery
// link. Serves the static admin page and mocks /api/config and Supabase Auth/REST.
// Requires the playwright package: npm install --no-save playwright
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=fileURLToPath(new URL("..",import.meta.url));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css"};
const server=createServer(async (req,res)=>{
  const path=new URL(req.url,"http://x").pathname;
  try{const body=await readFile(join(root,path==="/"?"admin.html":path));res.writeHead(200,{"Content-Type":types[extname(path)]||"text/html"});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const DB="https://db.test";
const shotDir=process.env.E2E_SCREENSHOT_DIR||null;
const errors=[];
const browser=await chromium.launch();
const STRONG="Toko-Aman#2026";

async function openAdmin(width,hash="",{putError=null}={}){
  const page=await browser.newPage({viewport:{width,height:900}});
  const calls={recover:[],put:[]};
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin)&&!url.href.startsWith(DB),route=>route.abort());
  await page.route(`${origin}/api/config`,route=>route.fulfill({json:{supabaseUrl:DB,supabaseAnonKey:"anon"}}));
  await page.route(`${DB}/**`,route=>{
    const url=new URL(route.request().url()),method=route.request().method();
    if(url.pathname==="/auth/v1/recover"){calls.recover.push({email:route.request().postDataJSON().email,redirect:url.searchParams.get("redirect_to"),apikey:route.request().headers().apikey});return route.fulfill({json:{}});}
    if(url.pathname==="/auth/v1/user"&&method==="PUT"){
      calls.put.push({auth:route.request().headers().authorization,password:route.request().postDataJSON().password});
      if(putError) return route.fulfill({status:422,json:{code:422,error_code:"same_password",msg:putError}});
      return route.fulfill({json:{id:"admin-1",email:"rivaldiworks@gmail.com"}});
    }
    if(url.pathname==="/rest/v1/admin_profiles") return route.fulfill({json:[{id:"admin-1",full_name:"Rivaldi",role:"admin"}]});
    return route.fulfill({json:[]});
  });
  await page.goto(`${origin}/admin.html${hash}`);
  return {page,calls};
}

async function run(width){
  // 1. Eye toggle on the login password.
  {
    const {page}=await openAdmin(width);
    await page.waitForSelector("#loginForm:not(.hidden)");
    await page.fill("#password","rahasia123");
    const eye=page.locator('[data-toggle-password="password"]');
    assert.equal(await eye.getAttribute("aria-label"),"Tampilkan password");
    await eye.click();
    assert.equal(await page.locator("#password").getAttribute("type"),"text","password is shown");
    assert.equal(await eye.getAttribute("aria-pressed"),"true");
    assert.equal(await eye.getAttribute("aria-label"),"Sembunyikan password");
    assert.equal(await page.locator("#password").inputValue(),"rahasia123","value is kept");
    await eye.click();
    assert.equal(await page.locator("#password").getAttribute("type"),"password","password is hidden again");
    if(shotDir) await page.locator("#loginView").screenshot({path:`${shotDir}/admin-login-${width}.png`});

    // 2. Lupa password: neutral confirmation, link returns to the admin page.
    await page.fill("#email","rivaldiworks@gmail.com");
    await page.getByRole("button",{name:"Lupa password?"}).click();
    await page.waitForSelector("#forgotForm:not(.hidden)");
    assert.equal(await page.locator("#loginTitle").innerText(),"Lupa password");
    assert.equal(await page.locator("#forgotEmail").inputValue(),"rivaldiworks@gmail.com","email carries over");
    await page.getByRole("button",{name:"Kirim link reset"}).click();
    await page.waitForSelector("#forgotMessage:not(.hidden)");
    assert.match(await page.locator("#forgotMessage").innerText(),/Jika email terdaftar/);
    await page.getByRole("button",{name:"← Kembali ke login"}).click();
    await page.waitForSelector("#loginForm:not(.hidden)");
    await page.close();
  }
  {
    const {page,calls}=await openAdmin(width);
    await page.waitForSelector("#loginForm:not(.hidden)");
    await page.getByRole("button",{name:"Lupa password?"}).click();
    await page.fill("#forgotEmail","rivaldiworks@gmail.com");
    await page.getByRole("button",{name:"Kirim link reset"}).click();
    await page.waitForSelector("#forgotMessage:not(.hidden)");
    assert.deepEqual(calls.recover,[{email:"rivaldiworks@gmail.com",redirect:`${origin}/admin.html`,apikey:"anon"}]);
    await page.close();
  }
  // 3. Reset link: tokens are stripped from the URL, weak or mismatched passwords are
  //    refused before calling Supabase, then the new password is saved and the admin is in.
  {
    const {page,calls}=await openAdmin(width,"#access_token=rec-token&expires_in=3600&refresh_token=rec-refresh&token_type=bearer&type=recovery");
    await page.waitForSelector("#resetForm:not(.hidden)");
    assert.equal(new URL(page.url()).hash,"","recovery tokens are removed from the address bar");
    assert.equal(await page.locator("#loginTitle").innerText(),"Buat password baru");
    await page.fill("#newPassword","pendek");
    await page.fill("#confirmPassword","pendek");
    await page.getByRole("button",{name:"Simpan password"}).click();
    assert.match(await page.locator("#resetError").innerText(),/minimal 12 karakter/);
    await page.fill("#newPassword","hurufkecilsemua123");
    await page.fill("#confirmPassword","hurufkecilsemua123");
    await page.getByRole("button",{name:"Simpan password"}).click();
    assert.match(await page.locator("#resetError").innerText(),/huruf besar, huruf kecil, angka, dan simbol/);
    await page.fill("#newPassword",STRONG);
    await page.fill("#confirmPassword",STRONG+"x");
    await page.getByRole("button",{name:"Simpan password"}).click();
    assert.match(await page.locator("#resetError").innerText(),/tidak sama/);
    assert.equal(calls.put.length,0,"invalid input never reaches Supabase");
    await page.locator('[data-toggle-password="newPassword"]').click();
    assert.equal(await page.locator("#newPassword").getAttribute("type"),"text","new password can be shown");
    if(shotDir) await page.locator("#loginView").screenshot({path:`${shotDir}/admin-reset-${width}.png`});
    await page.fill("#confirmPassword",STRONG);
    await page.getByRole("button",{name:"Simpan password"}).click();
    await page.waitForSelector("#dashboardView:not(.hidden)");
    assert.deepEqual(calls.put,[{auth:"Bearer rec-token",password:STRONG}],"the recovery session sets the password");
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("gyd_admin_session")));
    assert.equal(stored.refresh_token,"rec-refresh","the admin stays signed in");
    await page.close();
  }
  // 4. Supabase rejects the new password: the message is shown in Indonesian.
  {
    const {page}=await openAdmin(width,"#access_token=rec-token&refresh_token=r&type=recovery",{putError:"New password should be different from the old password."});
    await page.waitForSelector("#resetForm:not(.hidden)");
    await page.fill("#newPassword",STRONG);await page.fill("#confirmPassword",STRONG);
    await page.getByRole("button",{name:"Simpan password"}).click();
    await page.waitForFunction(()=>/berbeda dari password lama/.test(document.querySelector("#resetError")?.textContent||""));
    assert.equal(await page.locator("#dashboardView").isVisible(),false);
    await page.close();
  }
  // 5. Expired or reused link.
  {
    const {page}=await openAdmin(width,"#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await page.waitForSelector("#forgotForm:not(.hidden)");
    assert.match(await page.locator("#forgotError").innerText(),/kedaluwarsa/);
    assert.equal(new URL(page.url()).hash,"");
    await page.close();
  }
}

await run(1280);
await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Admin password reset browser test passed.");
