const res = await fetch("https://videojuegooscom-bjtdr3mai-daniels-projects-771407af.vercel.app/vender?v=" + Date.now());
const html = await res.text();
const cabeza = html.slice(0, html.indexOf("</head>"));
console.log(res.status, res.headers.get("x-vercel-cache"));
console.log(cabeza.match(/<meta[^>]*name="description"[^>]*>/g));
console.log(cabeza.match(/<link rel="icon"[^>]*>/g));
