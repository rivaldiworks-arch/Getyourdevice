"use strict";
const fs=require("node:fs");

module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV==="production") return res.status(404).json({error:"Not found"});
  try{
    const app=fs.readFileSync(require.resolve("../app.js"),"utf8");
    const admin=fs.readFileSync(require.resolve("../admin.js"),"utf8");
    new Function(app);
    new Function(admin);
    const checks={
      appRoutes:["navigateRoute","applyRoute","routeHash","hashchange","popstate"].every(marker=>app.includes(marker)),
      adminRoutes:["navigateAdminRoute","applyAdminRoute","adminRouteHash","hashchange","popstate"].every(marker=>admin.includes(marker)),
      ordersRoute:app.includes('case "show-orders": navigateRoute("pesanan")'),
      adminOrdersRoute:admin.includes('button.dataset.tab==="orders"?"pesanan":"produk"')
    };
    return res.status(200).json({syntax:true,...checks});
  }catch(error){
    return res.status(500).json({syntax:false,error:error.message});
  }
};