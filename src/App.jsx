import { useState, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DTF_COST_PER_SQIN = 0.00986; // CAD per sq inch consumable cost
const HST_RATE  = 0.13;
const RUSH_FEE  = 0.15;
const SETUP_FEE = 15.00;
const RETAIL_THRESHOLD = 12; // orders under this use retail pricing

// DTF placements — sq inches drives both wholesale cost and retail add-on
const DTF_PLACEMENTS = {
  "Left Chest (LC)":    { sqIn: 12  },
  "Right Chest":        { sqIn: 12  },
  "Full Front":         { sqIn: 144 },
  "Full Back":          { sqIn: 144 },
  "Left Sleeve":        { sqIn: 16  },
  "Right Sleeve":       { sqIn: 16  },
  "Small Logo (2×3\")": { sqIn: 6   },
  "Hood Print":         { sqIn: 30  },
  "Nape / Back Neck":   { sqIn: 6   },
  "Custom Size":        { sqIn: 0   },
};

// Garment data:
//   wholesale   = what TNT pays
//   retailBase  = what customer pays for 1–11 pcs (garment portion, before DTF add-on)
//   garmentMarkup / dtfMarkup = multipliers applied for 12+ pc bulk pricing
const GARMENTS = {
  "Gildan 5000 Tee": {
    sizeWholesale: { "S–XL": 4.00, "2XL": 6.75, "3XL–5XL": 9.00 },
    retailBase:    { "S–XL": 22.00, "2XL": 23.50, "3XL–5XL": 25.00 }, // garment portion only; DTF adds on top
    garmentMarkup: 1.85,  // wholesale × markup = bulk retail garment price
    dtfMarkup:     8.50,  // dtf_cost × markup = bulk retail dtf charge
    type: "tee",
  },
  "Gildan 18500 Hoodie": {
    sizeWholesale: { "S–XL": 16.00, "2XL": 19.00, "3XL–5XL": 21.00 },
    retailBase:    { "S–XL": 36.00, "2XL": 39.00, "3XL–5XL": 43.00 },
    garmentMarkup: 1.70,
    dtfMarkup:     8.50,
    type: "hoodie",
  },
  "Gildan 18000 Crewneck": {
    sizeWholesale: { "S–XL": 13.00, "2XL": 16.00, "3XL–5XL": 18.00 },
    retailBase:    { "S–XL": 30.00, "2XL": 33.00, "3XL–5XL": 37.00 },
    garmentMarkup: 1.75,
    dtfMarkup:     8.50,
    type: "crew",
  },
  "CSW Adult Tee": {
    sizeWholesale: { "S–XL": 4.00, "2XL–4XL": 5.00 },
    retailBase:    { "S–XL": 22.00, "2XL–4XL": 24.00 },
    garmentMarkup: 1.85,
    dtfMarkup:     8.50,
    type: "tee",
  },
  "CSW Hoodie": {
    sizeWholesale: { "S–XL": 15.00, "2XL–4XL": 18.00 },
    retailBase:    { "S–XL": 34.00, "2XL–4XL": 38.00 },
    garmentMarkup: 1.70,
    dtfMarkup:     8.50,
    type: "hoodie",
  },
  "CSW Performance Tee (CX2)": {
    sizeWholesale: { "S–XL": 7.00, "2XL–4XL": 9.00 },
    retailBase:    { "S–XL": 24.00, "2XL–4XL": 27.00 },
    garmentMarkup: 1.80,
    dtfMarkup:     8.50,
    type: "tee",
  },
  "CSW Youth Tee": {
    sizeWholesale: { "Youth": 4.00 },
    retailBase:    { "Youth": 20.00 },
    garmentMarkup: 1.85,
    dtfMarkup:     8.50,
    type: "tee",
  },
  "Custom / Other": {
    sizeWholesale: { "S–XL": 0, "2XL": 0, "3XL+": 0 },
    retailBase:    { "S–XL": 0, "2XL": 0, "3XL+": 0 },
    garmentMarkup: 1.75,
    dtfMarkup:     8.50,
    type: "other",
  },
};

// Sizes shown in the qty grid per garment
const GARMENT_SIZES = {
  "Gildan 5000 Tee":           ["S","M","L","XL","2XL","3XL","4XL","5XL"],
  "Gildan 18500 Hoodie":       ["S","M","L","XL","2XL","3XL","4XL","5XL"],
  "Gildan 18000 Crewneck":     ["S","M","L","XL","2XL","3XL","4XL","5XL"],
  "CSW Adult Tee":             ["S","M","L","XL","2XL","3XL","4XL"],
  "CSW Hoodie":                ["S","M","L","XL","2XL","3XL","4XL"],
  "CSW Performance Tee (CX2)":["S","M","L","XL","2XL","3XL","4XL"],
  "CSW Youth Tee":             ["YS","YM","YL","YXL"],
  "Custom / Other":            ["S","M","L","XL","2XL","3XL"],
};

// Map individual sizes to their wholesale/retail tier
function sizeToTier(garmentName, size) {
  const g = GARMENTS[garmentName];
  if (!g) return Object.keys(g?.sizeWholesale || {})[0];
  const tiers = Object.keys(g.sizeWholesale);
  // Match by checking if size string is covered by tier label
  if (["3XL","4XL","5XL"].includes(size)) {
    return tiers.find(t => t.includes("3XL") || t.includes("4XL") || t.includes("5XL")) || tiers[0];
  }
  if (size === "2XL") {
    return tiers.find(t => t.startsWith("2XL")) || tiers[0];
  }
  if (["YS","YM","YL","YXL"].includes(size)) return tiers[0];
  return tiers[0]; // S–XL default
}

// ─── PRICING LOGIC ────────────────────────────────────────────────────────────

// Qty tiers for 12+ bulk orders (discount off markup price)
const BULK_TIERS = [
  { min: 12,  max: 23,  discount: 0.08,  label: "12–23 pcs" },
  { min: 24,  max: 47,  discount: 0.14,  label: "24–47 pcs" },
  { min: 48,  max: 99,  discount: 0.19,  label: "48–99 pcs" },
  { min: 100, max: 9999,discount: 0.24,  label: "100+ pcs"  },
];

function getBulkDiscount(qty) {
  const tier = BULK_TIERS.find(t => qty >= t.min && qty <= t.max);
  return tier ? tier.discount : 0.24;
}

function getBulkTierLabel(qty) {
  if (qty < RETAIL_THRESHOLD) return "Retail (1–11 pcs)";
  const tier = BULK_TIERS.find(t => qty >= t.min && qty <= t.max);
  return tier ? tier.label : "100+ pcs";
}

/**
 * Calculate per-piece price for a given size at a given total order qty.
 *
 * Under 12 pcs  → retail mode: retailBase (garment portion) + dtf retail add-on
 * 12+ pcs       → bulk mode:   wholesale × garmentMarkup + dtf_cost × dtfMarkup, then tier discount
 *
 * Manual discount stacks on top of either mode.
 * Rush stacks last.
 */
function calcPerPiece(garmentName, size, placements, totalQty, rush, manualDiscPct, customWholesale, customRetailBase) {
  const g        = GARMENTS[garmentName];
  const tier     = sizeToTier(garmentName, size);
  const isCustom = garmentName === "Custom / Other";

  const garmentWholesale = isCustom ? parseFloat(customWholesale || 0) : (g.sizeWholesale[tier] ?? 4.00);
  const garmentRetailBase= isCustom ? parseFloat(customRetailBase || 0) : (g.retailBase[tier]    ?? 22.00);

  // DTF costs
  const dtfConsumableTotal = placements.reduce((s, p) => {
    const sqIn = p.name === "Custom Size" ? parseFloat(p.customSqIn || 0) : DTF_PLACEMENTS[p.name].sqIn;
    return s + sqIn * DTF_COST_PER_SQIN;
  }, 0);

  let perPiece, garmentRetailUsed, dtfRetailUsed;

  if (totalQty < RETAIL_THRESHOLD) {
    // ── RETAIL MODE (1–11 pcs)
    // DTF retail add-on: consumable cost × dtfMarkup (same multiplier as bulk for consistency)
    dtfRetailUsed   = dtfConsumableTotal * g.dtfMarkup;
    garmentRetailUsed = garmentRetailBase;
    perPiece = garmentRetailBase + dtfRetailUsed;
  } else {
    // ── BULK MODE (12+ pcs)
    garmentRetailUsed = garmentWholesale * g.garmentMarkup;
    dtfRetailUsed     = dtfConsumableTotal * g.dtfMarkup;
    const basePrice   = garmentRetailUsed + dtfRetailUsed;
    const bulkDisc    = getBulkDiscount(totalQty);
    perPiece          = basePrice * (1 - bulkDisc);
  }

  // Manual discount + rush applied to both modes
  const manualDisc = parseFloat(manualDiscPct || 0) / 100;
  perPiece = perPiece * (1 - manualDisc);
  if (rush) perPiece = perPiece * (1 + RUSH_FEE);

  // Wholesale cost for profit calc
  const costPerPiece = garmentWholesale + dtfConsumableTotal;

  return {
    perPiece:      Math.round(perPiece * 100) / 100,
    costPerPiece:  Math.round(costPerPiece * 100) / 100,
    garmentRetailUsed: Math.round(garmentRetailUsed * 100) / 100,
    dtfRetailUsed: Math.round(dtfRetailUsed * 100) / 100,
    isRetailMode:  totalQty < RETAIL_THRESHOLD,
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2);

const newPlacement = () => ({ id: uid(), name: "Full Front", customSqIn: 0 });

function newSizeGrid(garmentName) {
  const sizes = GARMENT_SIZES[garmentName] || ["S","M","L","XL","2XL"];
  const grid = {};
  sizes.forEach(s => { grid[s] = 0; });
  return grid;
}

const newItem = () => ({
  id: uid(),
  description: "",
  garmentType: "Gildan 5000 Tee",
  placements: [newPlacement()],
  sizeGrid: newSizeGrid("Gildan 5000 Tee"),
  rush: false,
  customWholesale: 0,
  customRetailBase: 0,
});

// ─── PLACEMENT ROW ────────────────────────────────────────────────────────────
function PlacementRow({ p, onUpdate, onRemove, canRemove }) {
  const sqIn = p.name === "Custom Size" ? parseFloat(p.customSqIn || 0) : DTF_PLACEMENTS[p.name].sqIn;
  const consumable = (sqIn * DTF_COST_PER_SQIN).toFixed(4);

  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", background:"#0d0d0d", border:"1px solid #1e1e1e", borderRadius:6, padding:"7px 10px", marginBottom:5 }}>
      <span style={{ color:"#d62828", fontSize:13, flexShrink:0 }}>▸</span>
      <select value={p.name} onChange={e => onUpdate("name", e.target.value)}
        style={{ flex:1, background:"#141414", border:"1px solid #252525", color:"#ddd", padding:"5px 8px", borderRadius:4, fontFamily:"'DM Mono',monospace", fontSize:12, outline:"none" }}>
        {Object.keys(DTF_PLACEMENTS).map(k => <option key={k}>{k}</option>)}
      </select>
      {p.name === "Custom Size" && (
        <input type="number" min="0" step="1" placeholder="sq inches"
          value={p.customSqIn} onChange={e => onUpdate("customSqIn", e.target.value)}
          style={{ width:100, background:"#141414", border:"1px solid #252525", color:"#ddd", padding:"5px 8px", borderRadius:4, fontFamily:"'DM Mono',monospace", fontSize:12, outline:"none" }} />
      )}
      <div style={{ textAlign:"right", flexShrink:0, minWidth:60 }}>
        <div style={{ color:"#555", fontSize:10 }}>{sqIn} sq in</div>
        <div style={{ color:"#333", fontSize:9 }}>cost ${consumable}</div>
      </div>
      {canRemove
        ? <button onClick={onRemove} style={{ background:"none", border:"none", color:"#333", cursor:"pointer", fontSize:15, padding:"0 2px", flexShrink:0 }}>✕</button>
        : <span style={{ width:20, flexShrink:0 }} />}
    </div>
  );
}

// ─── SIZE QTY GRID ────────────────────────────────────────────────────────────
function SizeGrid({ garmentName, sizeGrid, placements, rush, manualDiscPct, customWholesale, customRetailBase, totalQty, onUpdate }) {
  const sizes = GARMENT_SIZES[garmentName] || Object.keys(sizeGrid);

  return (
    <div>
      {/* Header row */}
      <div style={{ display:"flex", gap:6, marginBottom:6, paddingLeft:4 }}>
        {sizes.map(s => {
          const qty = sizeGrid[s] || 0;
          const tier = sizeToTier(garmentName, s);
          const tierLabel = tier.includes("2XL") ? "2XL" : tier.includes("3XL") ? "3XL+" : "";
          return (
            <div key={s} style={{ flex:1, textAlign:"center" }}>
              <div style={{ color: tierLabel ? "#f5a623" : "#555", fontSize:11, fontWeight:600, marginBottom:3 }}>{s}</div>
              <input
                type="number" min="0" value={qty === 0 ? "" : qty}
                onChange={e => onUpdate(s, parseInt(e.target.value) || 0)}
                placeholder="0"
                style={{ width:"100%", background: qty > 0 ? "#141f14" : "#141414", border: qty > 0 ? "1px solid #2a4a2a" : "1px solid #1e1e1e",
                  color: qty > 0 ? "#ccc" : "#444", padding:"6px 4px", borderRadius:4,
                  fontFamily:"'DM Mono',monospace", fontSize:13, outline:"none", textAlign:"center" }}
              />
            </div>
          );
        })}
      </div>

      {/* Per-size price hint when qty > 0 */}
      {totalQty > 0 && (
        <div style={{ display:"flex", gap:6, marginTop:4 }}>
          {sizes.map(s => {
            const qty = sizeGrid[s] || 0;
            if (qty === 0) return <div key={s} style={{ flex:1 }} />;
            const calc = calcPerPiece(garmentName, s, placements, totalQty, rush, manualDiscPct, customWholesale, customRetailBase);
            return (
              <div key={s} style={{ flex:1, textAlign:"center" }}>
                <div style={{ color:"#4caf50", fontSize:10, fontWeight:600 }}>${calc.perPiece}</div>
                <div style={{ color:"#2a4a2a", fontSize:9 }}>×{qty}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [customer,   setCustomer]   = useState({ name:"", company:"", email:"", phone:"" });
  const [items,      setItems]      = useState([newItem()]);
  const [setupFee,   setSetupFee]   = useState(false);
  const [manualDisc, setManualDisc] = useState("");
  const [notes,      setNotes]      = useState("");
  const [showProfit, setShowProfit] = useState(true);

  const quoteNum = useRef(`TNT-${Date.now().toString().slice(-6)}`).current;
  const today    = new Date().toLocaleDateString("en-CA", { year:"numeric", month:"long", day:"numeric" });

  // ── mutations
  const updItem    = (id, f, v) => setItems(p => p.map(i => i.id===id ? {...i, [f]:v} : i));
  const addPlace   = (id) => setItems(p => p.map(i => i.id===id ? {...i, placements:[...i.placements, newPlacement()]} : i));
  const updPlace   = (iid,pid,f,v) => setItems(p => p.map(i => i.id===iid ? {...i, placements:i.placements.map(pl => pl.id===pid?{...pl,[f]:v}:pl)} : i));
  const delPlace   = (iid,pid) => setItems(p => p.map(i => i.id===iid ? {...i, placements:i.placements.filter(pl=>pl.id!==pid)} : i));
  const updSizeQty = (iid, size, qty) => setItems(p => p.map(i => i.id===iid ? {...i, sizeGrid:{...i.sizeGrid, [size]:qty}} : i));
  const delItem    = (id) => setItems(p => p.filter(i=>i.id!==id));

  const changeGarment = (id, newType) => {
    setItems(p => p.map(i => {
      if (i.id !== id) return i;
      return { ...i, garmentType: newType, sizeGrid: newSizeGrid(newType), customWholesale:0, customRetailBase:0 };
    }));
  };

  // ── compute all item totals
  const itemTotals = items.map(item => {
    const totalQty = Object.values(item.sizeGrid).reduce((s,q)=>s+q, 0);
    const isRetail = totalQty < RETAIL_THRESHOLD;

    // Per-size revenue + cost
    let lineRevenue = 0, lineCost = 0;
    const sizeDetails = [];
    Object.entries(item.sizeGrid).forEach(([size, qty]) => {
      if (qty <= 0) return;
      const calc = calcPerPiece(item.garmentType, size, item.placements, totalQty, item.rush, manualDisc, item.customWholesale, item.customRetailBase);
      const rev  = calc.perPiece * qty;
      const cost = calc.costPerPiece * qty;
      lineRevenue += rev;
      lineCost    += cost;
      sizeDetails.push({ size, qty, perPiece: calc.perPiece, costPerPiece: calc.costPerPiece, lineRev: rev, lineCost: cost });
    });

    const lineProfit = lineRevenue - lineCost;
    const marginPct  = lineRevenue > 0 ? (lineProfit / lineRevenue) * 100 : 0;
    const tierLabel  = getBulkTierLabel(totalQty);

    return { totalQty, isRetail, lineRevenue, lineCost, lineProfit, marginPct, tierLabel, sizeDetails };
  });

  const subtotal   = itemTotals.reduce((s,t) => s+t.lineRevenue, 0);
  const setupAmt   = setupFee ? SETUP_FEE : 0;
  const preHST     = subtotal + setupAmt;
  const hstAmt     = preHST * HST_RATE;
  const grandTotal = preHST + hstAmt;
  const totalCost  = itemTotals.reduce((s,t) => s+t.lineCost, 0);
  const totalProfit= preHST - totalCost;
  const totalMargin= preHST > 0 ? (totalProfit/preHST)*100 : 0;

  // ── build plain-text quote (shared by copy + print)
  const buildQuoteText = () => {
    const lines = items.map((item,idx) => {
      const t = itemTotals[idx];
      const placements = item.placements.map(p=>p.name).join(" + ");
      const sizeLines = t.sizeDetails.map(d =>
        "      " + d.size.padEnd(6) + " x " + String(d.qty).padStart(3) + "   $" + d.perPiece.toFixed(2) + "/ea   = $" + d.lineRev.toFixed(2)
      ).join("\n");
      const modeTag = t.isRetail ? " [Retail]" : " [" + t.tierLabel + "]";
      return (idx+1) + ". " + (item.description||item.garmentType) + (item.rush?" [RUSH]":"") + modeTag +
        "\n   Placements: " + placements + "\n" + sizeLines + "\n   Item Subtotal: $" + t.lineRevenue.toFixed(2);
    }).join("\n\n");
    const discNote = parseFloat(manualDisc)>0 ? "Additional " + manualDisc + "% discount applied.\n" : "";
    return [
      "TNT PRINT HOUSE",
      "QUOTE: " + quoteNum,
      "Date:  " + today,
      "-".repeat(46),
      "Customer: " + customer.name + (customer.company ? " | " + customer.company : ""),
      customer.email ? "Email:    " + customer.email : "",
      customer.phone ? "Phone:    " + customer.phone : "",
      "-".repeat(46),
      lines,
      "-".repeat(46),
      setupFee ? "Setup / Art Fee:           $" + SETUP_FEE.toFixed(2) : "",
      discNote,
      "Subtotal:                  $" + preHST.toFixed(2),
      "HST (13%):                 $" + hstAmt.toFixed(2),
      "TOTAL (CAD):               $" + grandTotal.toFixed(2),
      notes ? "\nNotes: " + notes : "",
      "-".repeat(46),
      "Thank you for choosing TNT Print House!",
    ].filter(Boolean).join("\n");
  };

  // ── copy with clipboard API + textarea fallback
  const handleCopy = () => {
    const text = buildQuoteText();
    const doFallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0;";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); alert("Quote copied to clipboard!"); }
      catch(e) { prompt("Copy this quote (Ctrl+A, Ctrl+C):", text); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => alert("Quote copied to clipboard!")).catch(doFallback);
    } else { doFallback(); }
  };

  // ── print — open clean white HTML quote in new window, auto-trigger print dialog
  const handlePrint = () => {
    const itemRows = items.map((item,idx) => {
      const t = itemTotals[idx];
      const placements = item.placements.map(p=>p.name).join(" + ");
      const sizeRows = t.sizeDetails.map(d =>
        '<tr>' +
        '<td style="padding:5px 14px;font-size:13px;color:#444;">' + d.size + '</td>' +
        '<td style="padding:5px 14px;text-align:center;font-size:13px;">' + d.qty + '</td>' +
        '<td style="padding:5px 14px;text-align:right;font-size:13px;">$' + d.perPiece.toFixed(2) + '</td>' +
        '<td style="padding:5px 14px;text-align:right;font-size:13px;font-weight:600;">$' + d.lineRev.toFixed(2) + '</td>' +
        '</tr>'
      ).join("");
      return (
        '<div style="margin-bottom:24px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">' +
        '<div style="background:#f5f5f5;padding:10px 16px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><span style="font-weight:700;font-size:15px;">' + (item.description||item.garmentType) + '</span>' +
        (item.rush ? '<span style="margin-left:8px;background:#d62828;color:white;font-size:10px;padding:2px 7px;border-radius:3px;font-weight:700;">RUSH</span>' : '') +
        '</div><span style="font-size:11px;color:#999;">' + (t.isRetail ? "Retail pricing" : "Bulk \xb7 " + t.tierLabel) + '</span></div>' +
        '<div style="padding:7px 16px;background:#fafafa;border-bottom:1px solid #eee;font-size:12px;color:#666;">Placements: <strong>' + placements + '</strong></div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="background:#f0f0f0;">' +
        '<th style="padding:6px 14px;text-align:left;font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Size</th>' +
        '<th style="padding:6px 14px;text-align:center;font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>' +
        '<th style="padding:6px 14px;text-align:right;font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Unit Price</th>' +
        '<th style="padding:6px 14px;text-align:right;font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Line Total</th>' +
        '</tr></thead>' +
        '<tbody>' + sizeRows + '</tbody>' +
        '<tfoot><tr style="border-top:2px solid #e0e0e0;background:#fafafa;">' +
        '<td colspan="3" style="padding:8px 14px;font-size:13px;color:#555;">Item Subtotal (' + t.totalQty + ' pcs)</td>' +
        '<td style="padding:8px 14px;text-align:right;font-weight:700;font-size:14px;color:#c00;">$' + t.lineRevenue.toFixed(2) + '</td>' +
        '</tr></tfoot></table></div>'
      );
    }).join("");

    const setupRow  = setupFee ? '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#666;border-top:1px solid #eee;"><span>Setup / Art Fee</span><span>$' + SETUP_FEE.toFixed(2) + '</span></div>' : '';
    const discRow   = parseFloat(manualDisc)>0 ? '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#999;"><span>Additional Discount (' + manualDisc + '%)</span><span>included</span></div>' : '';
    const notesHtml = notes ? '<div style="margin-top:28px;padding:14px;background:#fffbf0;border:1px solid #ffe099;border-radius:6px;"><div style="font-size:10px;color:#b08000;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Notes</div><div style="font-size:13px;color:#555;white-space:pre-wrap;">' + notes + '</div></div>' : '';

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>TNT Quote ' + quoteNum + '</title>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:white;color:#111;padding:36px;max-width:780px;margin:0 auto;}@media print{body{padding:0;}@page{margin:1.8cm;}}</style>' +
      '</head><body>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #d62828;">' +
      '<div><div style="font-size:26px;font-weight:900;color:#d62828;letter-spacing:0.03em;">TNT PRINT HOUSE</div>' +
      '<div style="font-size:11px;color:#aaa;letter-spacing:0.1em;text-transform:uppercase;margin-top:3px;">Custom Apparel &amp; DTF Printing</div></div>' +
      '<div style="text-align:right;"><div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.1em;">Quote</div>' +
      '<div style="font-size:22px;font-weight:700;">' + quoteNum + '</div><div style="font-size:12px;color:#888;margin-top:3px;">' + today + '</div></div></div>' +
      '<div style="margin-bottom:24px;padding:14px 16px;background:#f9f9f9;border-radius:6px;border:1px solid #eee;">' +
      '<div style="font-size:10px;color:#bbb;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Bill To</div>' +
      '<div style="font-size:16px;font-weight:700;">' + (customer.name||"\u2014") + (customer.company ? ' <span style="font-weight:400;color:#777;font-size:14px;">\xb7 ' + customer.company + '</span>' : '') + '</div>' +
      (customer.email ? '<div style="font-size:13px;color:#555;margin-top:4px;">' + customer.email + '</div>' : '') +
      (customer.phone ? '<div style="font-size:13px;color:#555;margin-top:2px;">' + customer.phone + '</div>' : '') +
      '</div>' +
      itemRows +
      '<div style="margin-left:auto;max-width:320px;margin-top:12px;">' +
      setupRow + discRow +
      '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#555;border-top:1px solid #eee;"><span>Subtotal</span><span>$' + preHST.toFixed(2) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#555;"><span>HST (13% Ontario)</span><span>$' + hstAmt.toFixed(2) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:13px 0 8px;border-top:2px solid #d62828;margin-top:6px;">' +
      '<span style="font-size:17px;font-weight:700;">TOTAL (CAD)</span>' +
      '<span style="font-size:22px;font-weight:900;color:#d62828;">$' + grandTotal.toFixed(2) + '</span></div></div>' +
      notesHtml +
      '<div style="margin-top:40px;padding-top:14px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#ccc;letter-spacing:0.06em;">THANK YOU FOR CHOOSING TNT PRINT HOUSE &nbsp;&middot;&nbsp; QUOTE VALID FOR 14 DAYS</div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},500);}' + '<\/script>' +
      '</body></html>';

    const w = window.open("", "_blank", "width=840,height=1060");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else { alert("Please allow pop-ups for this page, then try again."); }
  };

  // ── styles
  const inp  = { background:"#1a1a1a", border:"1px solid #252525", color:"#e0e0e0", padding:"8px 10px", borderRadius:4, fontFamily:"'DM Mono',monospace", fontSize:13, width:"100%", outline:"none" };
  const lbl  = { color:"#555", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:4 };
  const card = { background:"#111", border:"1px solid #1e1e1e", borderRadius:8, padding:20, marginBottom:16 };
  const secT = (c="#d62828") => ({ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, color:c, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 });

  return (
    <div style={{ fontFamily:"'DM Mono','Courier New',monospace", background:"#0a0a0a", minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow+Condensed:wght@700;900&display=swap');
        * { box-sizing:border-box; }
        input:focus,select:focus,textarea:focus { border-color:#d62828 !important; }
        select option { background:#1a1a1a; }
        .btn { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:15px; letter-spacing:0.08em; text-transform:uppercase; padding:10px 22px; border:none; border-radius:4px; cursor:pointer; transition:all 0.15s; }
        .btn-red   { background:#d62828; color:white; }  .btn-red:hover   { background:#b81f1f; }
        .btn-ghost { background:transparent; color:#555; border:1px solid #252525; } .btn-ghost:hover { border-color:#d62828; color:#d62828; }
        .add-pl { background:none; border:1px dashed #252525; color:#444; border-radius:5px; padding:5px 0; cursor:pointer; font-family:'DM Mono',monospace; font-size:12px; width:100%; margin-top:4px; transition:all 0.15s; }
        .add-pl:hover { border-color:#d62828; color:#d62828; }
        @media print { .no-print { display:none !important; } body { background:white !important; } }
      `}</style>

      {/* HEADER */}
      <div style={{ background:"#d62828", padding:"15px 28px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:27, color:"white", letterSpacing:"0.05em" }}>TNT PRINT HOUSE</div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase" }}>Quote Builder</div>
        </div>
        <div style={{ textAlign:"right", color:"rgba(255,255,255,0.75)", fontSize:12 }}>
          <div style={{ color:"white", fontWeight:700, fontSize:14 }}>{quoteNum}</div>
          <div>{today}</div>
        </div>
      </div>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"22px 18px" }}>

        {/* CUSTOMER */}
        <div style={card}>
          <div style={secT()}>Customer Info</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[["Customer Name","name","Jane Smith"],["Company / Brand","company","Acme Apparel Co."],["Email","email","jane@example.com"],["Phone","phone","(555) 000-0000"]].map(([l,f,ph])=>(
              <div key={f}><label style={lbl}>{l}</label><input style={inp} value={customer[f]} onChange={e=>setCustomer(p=>({...p,[f]:e.target.value}))} placeholder={ph}/></div>
            ))}
          </div>
        </div>

        {/* ORDER ITEMS */}
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:15, color:"#d62828", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Order Items</div>

        {items.map((item, idx) => {
          const t = itemTotals[idx];
          const isRetail = t.isRetail;
          const modeColor = isRetail ? "#7b5ea7" : "#4caf50";
          const modeLabel = isRetail ? "Retail pricing (1–11 pcs)" : `Bulk pricing · ${t.tierLabel}`;

          return (
            <div key={item.id} style={{ ...card, borderLeft:`3px solid ${modeColor}` }}>

              {/* Item header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, color:"#d62828", letterSpacing:"0.1em" }}>ITEM {idx+1}</span>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {/* Pricing mode badge */}
                  <span style={{ background: isRetail ? "#1a1020" : "#0e1e0e", color: modeColor, fontSize:10, padding:"2px 10px", borderRadius:3, fontWeight:700, border:`1px solid ${isRetail?"#3a2060":"#1a4a1a"}` }}>
                    {modeLabel}
                  </span>
                  {item.rush && <span style={{ background:"#d62828", color:"white", fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:700 }}>RUSH</span>}
                  {parseFloat(manualDisc)>0 && <span style={{ background:"#1f1800", color:"#f5a623", fontSize:10, padding:"2px 8px", borderRadius:3, fontWeight:700 }}>{manualDisc}% EXTRA</span>}
                  {items.length>1 && <button className="btn btn-ghost" style={{ padding:"3px 10px", fontSize:11 }} onClick={()=>delItem(item.id)}>✕ Remove</button>}
                </div>
              </div>

              {/* Garment + rush */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr auto", gap:12, marginBottom:16, alignItems:"end" }}>
                <div>
                  <label style={lbl}>Garment Type</label>
                  <select style={inp} value={item.garmentType} onChange={e=>changeGarment(item.id, e.target.value)}>
                    {Object.keys(GARMENTS).map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ paddingBottom:6 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", color:"#555", fontSize:12, whiteSpace:"nowrap" }}>
                    <input type="checkbox" checked={item.rush} onChange={e=>updItem(item.id,"rush",e.target.checked)} style={{ width:"auto", accentColor:"#d62828" }}/>
                    Rush +15%
                  </label>
                </div>
              </div>

              {/* Custom garment fields */}
              {item.garmentType === "Custom / Other" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <div><label style={lbl}>Wholesale Cost ($)</label><input style={inp} type="number" min="0" step="0.25" value={item.customWholesale} onChange={e=>updItem(item.id,"customWholesale",e.target.value)} placeholder="0.00"/></div>
                  <div><label style={lbl}>Retail Base Price ($)</label><input style={inp} type="number" min="0" step="0.50" value={item.customRetailBase} onChange={e=>updItem(item.id,"customRetailBase",e.target.value)} placeholder="0.00"/></div>
                </div>
              )}

              {/* PLACEMENTS */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:7 }}>
                  <label style={{ ...lbl, marginBottom:0 }}>Print Placements <span style={{ color:"#333" }}>({item.placements.length})</span></label>
                  <span style={{ fontSize:10, color:"#333" }}>sq in shown for reference</span>
                </div>
                {item.placements.map(p=>(
                  <PlacementRow key={p.id} p={p} onUpdate={(f,v)=>updPlace(item.id,p.id,f,v)} onRemove={()=>delPlace(item.id,p.id)} canRemove={item.placements.length>1}/>
                ))}
                <button className="add-pl" onClick={()=>addPlace(item.id)}>+ Add Placement</button>
              </div>

              {/* SIZE QTY GRID */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                  <label style={{ ...lbl, marginBottom:0 }}>Size Quantities</label>
                  <span style={{ fontSize:10, color:"#444" }}>
                    {t.totalQty > 0
                      ? <span style={{ color: modeColor }}>{t.totalQty} pcs total</span>
                      : <span style={{ color:"#333" }}>enter quantities below</span>}
                  </span>
                </div>
                <SizeGrid
                  garmentName={item.garmentType}
                  sizeGrid={item.sizeGrid}
                  placements={item.placements}
                  rush={item.rush}
                  manualDiscPct={manualDisc}
                  customWholesale={item.customWholesale}
                  customRetailBase={item.customRetailBase}
                  totalQty={t.totalQty}
                  onUpdate={(size,qty)=>updSizeQty(item.id,size,qty)}
                />
                {/* Pricing mode note */}
                {t.totalQty > 0 && t.totalQty < RETAIL_THRESHOLD && (
                  <div style={{ marginTop:8, fontSize:10, color:"#7b5ea7", background:"#0e081a", border:"1px solid #2a1a4a", borderRadius:4, padding:"5px 10px" }}>
                    ⚠ Under 12 pcs — retail pricing applied. Add more pieces to unlock bulk pricing.
                  </div>
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Description / Notes</label>
                <input style={inp} value={item.description} onChange={e=>updItem(item.id,"description",e.target.value)} placeholder="e.g. Black tee — front + back logo"/>
              </div>

              {/* Item summary bar */}
              {t.totalQty > 0 && (
                <div style={{ background:"#0d0d0d", border:`1px solid ${modeColor}22`, borderRadius:6, padding:"10px 14px", display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{ fontSize:11, color:"#444" }}>Placements <span style={{ color:"#777" }}>{item.placements.map(p=>p.name).join(" + ")}</span></span>
                  <span style={{ fontSize:14, color:"#d62828", fontWeight:700, marginLeft:"auto" }}>Item Total ${t.lineRevenue.toFixed(2)}</span>
                </div>
              )}
            </div>
          );
        })}

        <button className="btn btn-ghost no-print" onClick={()=>setItems(p=>[...p,newItem()])} style={{ width:"100%", marginBottom:22, fontSize:14 }}>
          + Add Another Garment
        </button>

        {/* ADD-ONS + DISCOUNT + NOTES */}
        <div style={card}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:20 }}>
            <div>
              <div style={secT()}>Add-ons</div>
              <label style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer", color:"#777", fontSize:13 }}>
                <input type="checkbox" checked={setupFee} onChange={e=>setSetupFee(e.target.checked)} style={{ width:"auto", accentColor:"#d62828" }}/>
                Setup / Art Fee (+$15.00)
              </label>
            </div>
            <div>
              <div style={secT("#f5a623")}>Extra Discount</div>
              <label style={lbl}>Additional % off (order-wide)</label>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input style={{ ...inp, width:80 }} type="number" min="0" max="100" step="1"
                  value={manualDisc} onChange={e=>setManualDisc(e.target.value)} placeholder="0"/>
                <span style={{ color:"#555", fontSize:13 }}>%</span>
              </div>
              <div style={{ fontSize:10, color:"#333", marginTop:5 }}>Stacks on top of all pricing</div>
            </div>
            <div>
              <div style={secT()}>Quote Notes</div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
                placeholder="e.g. Turnaround: 5–7 business days. Quote valid for 14 days."
                style={{ ...inp, resize:"vertical" }}/>
            </div>
          </div>
        </div>

        {/* TOTALS */}
        <div style={{ background:"#111", border:"1px solid #d62828", borderRadius:8, padding:"18px 22px", marginBottom:16, display:"flex", justifyContent:"flex-end" }}>
          <div style={{ minWidth:300 }}>
            {[
              ["Subtotal",              `$${subtotal.toFixed(2)}`,    "#666"],
              setupFee ? ["Setup / Art Fee", `$${SETUP_FEE.toFixed(2)}`, "#666"] : null,
              parseFloat(manualDisc)>0 ? [`Extra Discount (${manualDisc}%) — baked in`, "", "#f5a623"] : null,
              ["HST (13% Ontario)",     `$${hstAmt.toFixed(2)}`,      "#666"],
            ].filter(Boolean).map(([label,val,color])=>(
              <div key={label} style={{ display:"flex", justifyContent:"space-between", color, fontSize:13, marginBottom:7 }}>
                <span>{label}</span><span>{val}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid #222", paddingTop:11, marginTop:4 }}>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"white", letterSpacing:"0.05em" }}>TOTAL (CAD)</span>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:30, color:"#d62828" }}>${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* INTERNAL PROFIT PANEL */}
        <div className="no-print" style={{ background:"#0e0e0a", border:"1px solid #3a2c00", borderRadius:8, marginBottom:22, overflow:"hidden" }}>
          <button onClick={()=>setShowProfit(p=>!p)}
            style={{ width:"100%", background:"#1a1500", border:"none", padding:"12px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:16 }}>🔒</span>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, color:"#f5a623", letterSpacing:"0.14em", textTransform:"uppercase" }}>
                Internal — Profit & Cost Summary
              </span>
              <span style={{ fontSize:10, color:"#5a4200", border:"1px solid #3a2c00", borderRadius:3, padding:"1px 7px", letterSpacing:"0.08em" }}>NOT ON QUOTE</span>
            </div>
            <span style={{ color:"#5a4200", fontSize:13 }}>{showProfit?"▲ Hide":"▼ Show"}</span>
          </button>

          {showProfit && (
            <div style={{ padding:"18px 20px" }}>
              {items.map((item,idx)=>{
                const t = itemTotals[idx];
                const profColor = t.lineProfit>=0 ? "#4caf50" : "#d62828";
                return (
                  <div key={item.id} style={{ background:"#111008", borderRadius:5, padding:"10px 14px", marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <span style={{ color:"#5a4200", fontSize:11, fontWeight:700 }}>ITEM {idx+1}</span>
                      <span style={{ color:"#555", fontSize:11 }}>{item.description||item.garmentType}</span>
                      <span style={{ fontSize:11, color: t.isRetail?"#7b5ea7":"#4caf50" }}>{t.isRetail?"retail mode":"bulk mode"}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:profColor }}>Profit ${t.lineProfit.toFixed(2)} ({t.marginPct.toFixed(1)}%)</span>
                    </div>
                    {t.sizeDetails.map(d=>(
                      <div key={d.size} style={{ display:"flex", gap:14, flexWrap:"wrap", padding:"4px 0", borderTop:"1px solid #1a1a10", fontSize:11, color:"#444" }}>
                        <span style={{ color:"#666", minWidth:40 }}>{d.size}</span>
                        <span>×{d.qty}</span>
                        <span>Cost/ea <span style={{ color:"#777" }}>${d.costPerPiece.toFixed(2)}</span></span>
                        <span>Sell/ea <span style={{ color:"#bbb" }}>${d.perPiece.toFixed(2)}</span></span>
                        <span>Rev <span style={{ color:"#888" }}>${d.lineRev.toFixed(2)}</span></span>
                        <span>Cost <span style={{ color:"#666" }}>${d.lineCost.toFixed(2)}</span></span>
                        <span style={{ marginLeft:"auto" }}>Profit <span style={{ color:d.lineRev-d.lineCost>=0?"#4caf50":"#d62828", fontWeight:700 }}>${(d.lineRev-d.lineCost).toFixed(2)}</span></span>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Summary grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:1, marginTop:14 }}>
                {[
                  ["Revenue (pre-tax)", `$${preHST.toFixed(2)}`,    "#ccc"],
                  ["HST Collected",     `$${hstAmt.toFixed(2)}`,     "#777"],
                  ["Total Cost",        `$${totalCost.toFixed(2)}`,   "#777"],
                  ["Profit",            `$${totalProfit.toFixed(2)}`, totalProfit>=0?"#4caf50":"#d62828"],
                  ["Margin",            `${totalMargin.toFixed(1)}%`, totalMargin>=35?"#4caf50":totalMargin>=20?"#f5a623":"#d62828"],
                ].map(([label,val,color])=>(
                  <div key={label} style={{ background:"#111008", padding:"12px 14px", textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"#3a3a20", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>{label}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8, fontSize:10, color:"#2a2000", textAlign:"right" }}>
                Cost = garment wholesale + DTF consumable only. HST is collected, not profit.
              </div>
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div className="no-print" style={{ display:"flex", gap:12 }}>
          <button className="btn btn-red"   style={{ flex:1, fontSize:15 }} onClick={handlePrint}>🖨 Export as PDF / Print</button>
          <button className="btn btn-ghost" style={{ flex:1, fontSize:15 }} onClick={handleCopy}>📋 Copy Quote Text</button>
        </div>

        <div style={{ marginTop:18, textAlign:"center", color:"#252525", fontSize:11, letterSpacing:"0.1em" }}>
          TNT PRINT HOUSE · {quoteNum} · {today}
        </div>
      </div>
    </div>
  );
}
