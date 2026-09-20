"use strict";
module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV==="production") return res.status(404).json({error:"Not found"});
  try{
    const base=`https://${process.env.VERCEL_URL}`;
    const [appRes,adminRes]=await Promise.all([fetch(base+"/app.js"),fetch(base+"/admin.js")]);
    const app=await appRes.text(),admin=await adminRes.text();
    if(!appRes.ok||!adminRes.ok) throw new Error("Static JS fetch failed");
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