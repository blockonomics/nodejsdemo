// src/views.js
// Server-rendered HTML for the Satoshi Books storefront.
import { STORE, BOOKS, formatPrice } from "./catalog.js";

function escapeHtml(s = "") {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Shared page shell. `head` lets a page inject extra <script>/<style>.
function layout({ title, body, head = "" }) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} · ${escapeHtml(STORE.name)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
        :root { --accent:#f7931a; --ink:#1b1b1f; --muted:#6b7280; --bg:#faf9f7; --card:#fff; --line:#ececec; }
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin:0; color:var(--ink); background:var(--bg); }
        a { color: inherit; }
        .wrap { max-width: 1040px; margin: 0 auto; padding: 0 1.25rem; }
        header.site { border-bottom:1px solid var(--line); background:var(--card); }
        header.site .wrap { display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; }
        .brand { font-weight:800; font-size:1.25rem; letter-spacing:-0.02em; text-decoration:none; }
        .brand .btc { color:var(--accent); }
        .brand small { display:block; font-weight:500; font-size:.72rem; color:var(--muted); letter-spacing:0; }
        nav a { text-decoration:none; color:var(--muted); font-size:.9rem; margin-left:1.25rem; }
        nav a:hover { color:var(--ink); }
        .hero { padding:2.5rem 0 1rem; }
        .hero h1 { font-size:1.9rem; margin:0 0 .4rem; letter-spacing:-0.02em; }
        .hero p { color:var(--muted); margin:0; }
        .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:1.25rem; padding:1.5rem 0 3rem; }
        .card { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; text-decoration:none; color:inherit; display:flex; flex-direction:column; transition:transform .12s ease, box-shadow .12s ease; }
        .card:hover { transform:translateY(-3px); box-shadow:0 10px 26px rgba(0,0,0,.08); }
        .cover { aspect-ratio:3/4; display:flex; align-items:flex-end; padding:1rem; color:#fff; }
        .cover h3 { margin:0; font-size:1.05rem; line-height:1.2; text-shadow:0 1px 8px rgba(0,0,0,.25); }
        .card .meta { padding:.85rem 1rem 1.1rem; }
        .card .author { color:var(--muted); font-size:.82rem; margin:.1rem 0 .55rem; }
        .price { font-weight:700; color:var(--accent); }
        .detail { display:grid; grid-template-columns:300px 1fr; gap:2.25rem; padding:2.25rem 0 3rem; }
        .detail .cover { border-radius:14px; aspect-ratio:3/4; }
        .detail h1 { margin:.2rem 0 .25rem; font-size:1.7rem; letter-spacing:-0.02em; }
        .detail .author { color:var(--muted); margin:0 0 1rem; }
        .detail .blurb { line-height:1.6; color:#33343a; }
        .detail .bigprice { font-size:1.8rem; font-weight:800; margin:1.25rem 0; }
        .pay { margin-top:.5rem; }
        .pillrow { margin:1.25rem 0; display:flex; gap:.5rem; flex-wrap:wrap; }
        .pill { font-size:.78rem; color:var(--muted); background:#f1f0ee; border-radius:999px; padding:.3rem .7rem; }
        .toggle { margin:1.5rem 0 .5rem; font-size:.85rem; }
        .toggle a { color:var(--accent); }
        .note { background:#fff8ee; border:1px solid #ffe2bd; color:#8a5a00; border-radius:10px; padding:.7rem .9rem; font-size:.85rem; margin-top:1rem; }
        footer.site { border-top:1px solid var(--line); color:var(--muted); font-size:.83rem; padding:1.5rem 0; }
        .back { display:inline-block; margin:1.5rem 0 0; color:var(--muted); text-decoration:none; font-size:.9rem; }
        .center { text-align:center; padding:4rem 0; }
        .center h1 { font-size:2rem; }
        .btn { display:inline-block; background:var(--accent); color:#fff; text-decoration:none; padding:.7rem 1.3rem; border-radius:10px; font-weight:600; margin-top:1rem; }
        @media (max-width:680px){ .detail{ grid-template-columns:1fr; } .detail .cover{ max-width:240px; } }
    </style>
    ${head}
</head>
<body>
    <header class="site">
        <div class="wrap">
            <a class="brand" href="/">${escapeHtml(STORE.name)} <span class="btc">₿</span>
                <small>${escapeHtml(STORE.tagline)}</small>
            </a>
            <nav>
                <a href="/">Shop</a>
                <a href="/admin/orders">Orders</a>
            </nav>
        </div>
    </header>
    <main class="wrap">
        ${body}
    </main>
    <footer class="site">
        <div class="wrap">© ${new Date().getFullYear()} ${escapeHtml(STORE.name)} · Bitcoin payments by Blockonomics</div>
    </footer>
</body>
</html>`;
}

// ---- Storefront home: grid of books --------------------------------------
export function renderHome() {
    const cards = BOOKS.map(
        (b) => `
        <a class="card" href="/book/${encodeURIComponent(b.productId)}">
            <div class="cover" style="background:${b.cover}">
                <h3>${escapeHtml(b.title)}</h3>
            </div>
            <div class="meta">
                <div class="author">${escapeHtml(b.author)}</div>
                <div class="price">${formatPrice(b.priceMinor)}</div>
            </div>
        </a>`
    ).join("");

    const body = `
        <section class="hero">
            <h1>Books on sound money &amp; Bitcoin</h1>
            <p>Every title ships worldwide. Checkout in Bitcoin — no account needed.</p>
        </section>
        <section class="grid">${cards}</section>`;

    return layout({ title: "Shop", body });
}

// ---- Product detail page: Payment Button (hosted modal) -------------------
export function renderBook(book, uid) {
    // The hosted modal button (new web component).
    const buttonBlock = `
        <div class="pay">
            <blockonomics-pay-button uid="${uid}" label="Pay with Crypto"></blockonomics-pay-button>
        </div>
        <script src="https://www.blockonomics.co/js/pay-button.js"></script>`;

    const body = `
        <section class="detail">
            <div class="cover" style="background:${book.cover}">
                <h3>${escapeHtml(book.title)}</h3>
            </div>
            <div>
                <h1>${escapeHtml(book.title)}</h1>
                <p class="author">by ${escapeHtml(book.author)}</p>
                <p class="blurb">${escapeHtml(book.blurb)}</p>
                <div class="pillrow">
                    <span class="pill">Paperback</span>
                    <span class="pill">${book.pages} pages</span>
                    <span class="pill">Ships worldwide</span>
                </div>
                <div class="bigprice">${formatPrice(book.priceMinor)}</div>
                ${buttonBlock}
                <div class="note">Demo store. Checkout uses Blockonomics' hosted Bitcoin payment flow — use testnet before going live.</div>
            </div>
        </section>
        <a class="back" href="/">← Back to shop</a>`;

    return layout({ title: book.title, body });
}

// ---- Success / cancel landing pages --------------------------------------
export function renderSuccess() {
    const body = `
        <div class="center">
            <h1>✓ Thank you!</h1>
            <p>Your Bitcoin payment is confirmed. A receipt is on its way to your email.</p>
            <a class="btn" href="/">Continue shopping</a>
        </div>`;
    return layout({ title: "Payment complete", body });
}

export function renderCancel() {
    const body = `
        <div class="center">
            <h1>Checkout cancelled</h1>
            <p>No payment was taken. Your basket is still here whenever you're ready.</p>
            <a class="btn" href="/">Back to shop</a>
        </div>`;
    return layout({ title: "Checkout cancelled", body });
}

export function renderNotFound() {
    const body = `
        <div class="center">
            <h1>404</h1>
            <p>We couldn't find that title.</p>
            <a class="btn" href="/">Back to shop</a>
        </div>`;
    return layout({ title: "Not found", body });
}
