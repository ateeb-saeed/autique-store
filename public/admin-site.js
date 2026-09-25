// ---------- Site editor: storefront content, sections, customer rules, logistics rights ----------
let siteData = null;       // { site, defaults, integrations }
let siteSection = 'content';
let siteDirty = false;

const SITE_SWITCHES = {
  sections: [
    ['logoBanner', 'Animated logo banner', 'The navy "autique. → auto-boutique" banner at the top of the home page.'],
    ['trustStrip', 'Trust strip', 'The three reassurance boxes under the home page hero.'],
    ['collections', 'Shop by collection', 'Collection tiles on the home page.'],
    ['bundles', 'Bundles', 'Bundles on the home page, in the menu and on the Bundles page.'],
    ['bestsellers', 'Bestsellers', 'The product grid on the home page.'],
    ['brandPanel', 'Brand panel', 'The "showroom finish" panel with the brand names, at the bottom of the home page.'],
    ['aboutPage', 'About us page', 'The About page and its links in the menu and footer.']
  ],
  customers: [
    ['allowSignup', 'New customers can sign up', 'When off, nobody new can create an account (email or Google). Existing customers can still sign in.'],
    ['allowGoogle', 'Sign in with Google', 'Shows the Google button on sign-in and sign-up pages.', 'googleConfigured', 'Needs GOOGLE_CLIENT_ID to be set on the server.'],
    ['allowEmailChange', 'Customers can change their email', 'When off, the email on the Profile page is read-only.'],
    ['allowOrderTracking', 'Track your order page', 'The order-number lookup page and its links.'],
    ['cashOnDelivery', 'Cash on delivery', 'Offer cash on delivery at checkout.'],
    ['payOnline', 'Pay online (Rapid Gateway)', 'Offer card / JazzCash / Easypaisa at checkout.', 'payOnlineConfigured', 'Needs RG_MERCHANT_ID to be set on the server.']
  ],
  logistics: [
    ['viewOrders', 'See orders', 'The Orders tab in the logistics portal.'],
    ['dispatch', 'Mark orders as dispatched', 'Dispatch takes items off stock. Needs "See orders".'],
    ['restock', 'Restock', 'Add units that arrived to the stock count.'],
    ['viewHistory', 'See stock history', 'Every restock, dispatch and admin stock edit.'],
    ['seeCustomerContact', "See customers' phone and address", 'When off, only the name and city are shown.'],
    ['seeCodAmount', 'See cash-on-delivery amounts', 'The "Collect Rs. …" line on COD orders.']
  ]
};

const SITE_SECTIONS = [
  ['content', 'Content', 'Words and pictures customers see on the store.'],
  ['sections', 'Sections', 'Choose which parts of the store are shown.'],
  ['customers', 'Customer rules', 'What customers can do: sign-ups, payments, tracking.'],
  ['logistics', 'Logistics rights', 'What the logistics login is allowed to see and do. You (the admin) can always do everything.']
];

async function loadSiteEditor(){
  const res = await fetch('/api/admin/site');
  if(!res.ok) return;
  siteData = await res.json();
  siteDirty = false;
  renderSiteEditor();
}

function siteField(label, name, value, opts = {}){
  const id = `se-${name.replace(/\W/g, '-')}`;
  const input = opts.textarea
    ? `<textarea class="input" id="${id}" data-k="${name}" rows="${opts.rows || 3}" maxlength="${opts.max || 300}">${esc(value)}</textarea>`
    : `<input class="input" id="${id}" data-k="${name}" value="${esc(value)}" maxlength="${opts.max || 120}" ${opts.type ? `type="${opts.type}"` : ''} ${opts.attrs || ''}>`;
  return `<div class="field"><label for="${id}">${label}</label>${input}${opts.hint ? `<div class="hint">${opts.hint}</div>` : ''}</div>`;
}

function contentHTML(c){
  const trust = [0, 1, 2].map(i => `<div class="row">${siteField(`Box ${i + 1} title`, `trust.${i}.title`, (c.trust[i] || {}).title)}${siteField(`Box ${i + 1} text`, `trust.${i}.text`, (c.trust[i] || {}).text)}</div>`).join('');
  const about = [0, 1, 2, 3, 4].map(i => `<div class="row">${siteField(`Point ${i + 1} (bold part)`, `aboutPoints.${i}.title`, (c.aboutPoints[i] || {}).title)}${siteField(`Point ${i + 1} text`, `aboutPoints.${i}.text`, (c.aboutPoints[i] || {}).text, { max: 300 })}</div>`).join('');
  return `
    <div class="box"><h3>Announcement bar</h3><div class="form">
      ${siteField('Text in the navy strip at the very top', 'announcement', c.announcement, { max: 300, hint: 'While a sale is running, the sale label is shown here instead. Leave empty to hide the strip.' })}
    </div></div>
    <div class="box"><h3>Home page: hero</h3><div class="form">
      ${siteField('Small heading above the title', 'heroEyebrow', c.heroEyebrow)}
      ${siteField('Main title', 'heroTitle', c.heroTitle, { attrs: 'required' })}
      ${siteField('Intro text', 'heroText', c.heroText, { textarea: true, rows: 2 })}
      ${siteField('Button label', 'heroButton', c.heroButton, { max: 40 })}
      ${siteField('Brands', 'brands', c.brands.join(', '), { max: 300, hint: 'Comma separated. Shown in the hero and the brand panel.' })}
    </div></div>
    <div class="box"><h3>Home page: trust strip</h3><div class="form">${trust}</div></div>
    <div class="box"><h3>Home page: bestsellers and brand panel</h3><div class="form">
      <div class="row">${siteField('Bestsellers title', 'bestsellersTitle', c.bestsellersTitle)}${siteField('How many products to show', 'bestsellersCount', c.bestsellersCount, { type: 'number', attrs: 'min="1" max="24"' })}</div>
      ${siteField('Bestsellers subtitle', 'bestsellersText', c.bestsellersText, { max: 300 })}
      ${siteField('Brand panel title', 'panelTitle', c.panelTitle)}
      ${siteField('Brand panel text', 'panelText', c.panelText, { textarea: true, rows: 2 })}
      ${siteField('Brand panel points', 'panelPoints', c.panelPoints.join('\n'), { textarea: true, rows: 3, max: 700, hint: 'One per line (up to 5).' })}
    </div></div>
    <div class="box"><h3>About us page</h3><div class="form">
      ${siteField('Heading', 'aboutTitle', c.aboutTitle)}
      ${siteField('Story', 'aboutStory', c.aboutStory, { textarea: true, rows: 10, max: 6000, hint: 'Leave a blank line between paragraphs.' })}
      ${about}
    </div></div>
    <div class="box"><h3>Business and contact details</h3><div class="form">
      <p class="hint" style="margin-top:0">Shown in the footer, on the Contact page and in the policies. The address must match your registration documents exactly.</p>
      ${!c.business.phone ? '<div class="note err">Add a contact number: payment providers require one in the footer.</div>' : ''}
      <div class="row">${siteField('Email', 'business.email', c.business.email, { type: 'email' })}${siteField('Contact number', 'business.phone', c.business.phone, { attrs: 'placeholder="e.g. 0321 1234567"' })}</div>
      ${siteField('Business address', 'business.address', c.business.address, { hint: 'Exactly as in your registration documents.' })}
      <div class="row">${siteField('City / region (shown on Contact page)', 'business.city', c.business.city)}${siteField('Opening hours', 'business.hours', c.business.hours)}</div>
      <div class="row">${siteField('Trading name', 'business.tradingName', c.business.tradingName)}${siteField('Legal structure', 'business.legalStructure', c.business.legalStructure)}</div>
      <div class="row">${siteField('Proprietor', 'business.owner', c.business.owner)}${siteField('NTN', 'business.ntn', c.business.ntn, { hint: 'Shown on the Contact and Terms pages. Leave empty to hide.' })}</div>
      ${siteField('Website', 'business.website', c.business.website)}
    </div></div>
    <div class="box"><h3>Photos: inventory, packaging and setup</h3>
      <p class="hint" style="margin-top:0">Shown as "Inside Autique" on the home page, the About page and How Autique works. Upload real photos of your stock, packed orders and workspace.</p>
      <div class="gallery-edit" id="galleryEdit">${(c.gallery || []).map((g, i) => `<figure><img src="${esc(g.src)}" alt=""><input class="input" data-gallery-caption="${i}" value="${esc(g.caption)}" placeholder="Caption, e.g. Our stock room" maxlength="120"><button type="button" class="btn btn-sm btn-danger" data-gallery-remove="${i}">Remove</button></figure>`).join('') || '<span class="hint">No photos yet.</span>'}</div>
      <label class="btn btn-sm" style="cursor:pointer;margin-top:12px">Upload photos<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden id="galleryUpload"></label>
    </div>
    <div class="box"><h3>How Autique works page</h3><div class="form">
      ${siteField('Business model', 'businessModel', c.businessModel, { textarea: true, rows: 14, max: 12000, hint: 'Start a line with "## " for a heading and "- " for a bullet. Put **text** in double stars for bold. Leave a blank line between paragraphs.' })}
      <p class="hint" style="margin:0">Customer journey steps (shown in order):</p>
      ${[...Array(12).keys()].map(i => `<div class="row">${siteField(`Step ${i + 1} title`, `journey.${i}.title`, (c.journey[i] || {}).title)}${siteField(`Step ${i + 1} text`, `journey.${i}.text`, (c.journey[i] || {}).text, { max: 300 })}</div>`).join('')}
    </div></div>
    <div class="box"><h3>Policy pages</h3><div class="form">
      <p class="hint" style="margin-top:0">Linked in the footer and menu. Same formatting as above.</p>
      ${siteField('Refund & Returns Policy', 'policies.refund', c.policies.refund, { textarea: true, rows: 12, max: 20000 })}
      ${siteField('Shipping Policy', 'policies.shipping', c.policies.shipping, { textarea: true, rows: 12, max: 20000 })}
      ${siteField('Privacy Policy', 'policies.privacy', c.policies.privacy, { textarea: true, rows: 12, max: 20000 })}
      ${siteField('Terms & Conditions', 'policies.terms', c.policies.terms, { textarea: true, rows: 12, max: 20000 })}
    </div></div>
    <div class="box"><h3>Footer</h3><div class="form">
      ${siteField('Tagline under the logo', 'footerTagline', c.footerTagline, { max: 300 })}
      ${siteField('Help lines', 'footerHelp', c.footerHelp.join('\n'), { textarea: true, rows: 3, max: 700, hint: 'One per line (up to 5).' })}
    </div></div>`;
}

function switchesHTML(group){
  const values = siteData.site[group];
  return `<div class="box"><div class="switch-list">${SITE_SWITCHES[group].map(([key, label, help, needs, needsText]) => {
    const missing = needs && !siteData.integrations[needs];
    return `<label class="switch-row">
      <span class="switch-text"><b>${label}</b><span>${help}${missing ? ` <em class="warn-text">${needsText} Until then it stays hidden even if switched on.</em>` : ''}</span></span>
      <input type="checkbox" class="switch" data-group="${group}" data-key="${key}" ${values[key] ? 'checked' : ''}>
    </label>`;
  }).join('')}</div></div>`;
}

function renderSiteEditor(){
  const root = document.getElementById('siteEditor');
  const sec = SITE_SECTIONS.find(s => s[0] === siteSection);
  root.innerHTML = `
    <div class="filter-group" id="siteTabs" style="margin-bottom:12px">${SITE_SECTIONS.map(([key, label]) => `<button class="filter-btn ${key === siteSection ? 'active' : ''}" data-site-tab="${key}">${label}</button>`).join('')}</div>
    <p class="panel-sub">${sec[2]}</p>
    <div id="siteBody">${siteSection === 'content' ? contentHTML(siteData.site.content) : switchesHTML(siteSection)}</div>
    <div class="save-bar">
      <span class="hint" id="siteStatus" style="margin:0">${siteDirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
      <span style="flex:1"></span>
      <button class="btn btn-sm" id="siteRestore">Restore defaults for this section</button>
      <button class="btn btn-sm" id="siteDiscard" ${siteDirty ? '' : 'disabled'}>Discard</button>
      <button class="btn btn-primary btn-sm" id="siteSave">Save changes</button>
    </div>`;
}

// Read the visible form back into siteData.site
function collectSiteForm(){
  const site = siteData.site;
  if(siteSection === 'content'){
    const c = site.content;
    document.querySelectorAll('#siteBody [data-k]').forEach(el => {
      const path = el.dataset.k.split('.');
      const v = el.value;
      if(path[0] === 'business' || path[0] === 'policies'){
        c[path[0]] = { ...(c[path[0]] || {}), [path[1]]: v };
      } else if(path.length === 3){
        c[path[0]] = c[path[0]] || [];
        c[path[0]][path[1]] = { ...(c[path[0]][path[1]] || { title: '', text: '' }), [path[2]]: v };
      } else if(path[0] === 'brands'){
        c.brands = v.split(',').map(s => s.trim()).filter(Boolean);
      } else if(path[0] === 'panelPoints' || path[0] === 'footerHelp'){
        c[path[0]] = v.split('\n').map(s => s.trim()).filter(Boolean);
      } else if(path[0] === 'bestsellersCount'){
        c.bestsellersCount = Number(v);
      } else {
        c[path[0]] = v;
      }
    });
    c.aboutPoints = (c.aboutPoints || []).filter(p => p && (p.title || p.text));
    c.journey = (c.journey || []).filter(p => p && (p.title || p.text));
    document.querySelectorAll('#siteBody [data-gallery-caption]').forEach(el => { c.gallery[Number(el.dataset.galleryCaption)].caption = el.value; });
  } else {
    document.querySelectorAll('#siteBody .switch').forEach(el => { site[el.dataset.group][el.dataset.key] = el.checked; });
  }
}

function markSiteDirty(){
  siteDirty = true;
  document.getElementById('siteStatus').textContent = 'You have unsaved changes.';
  document.getElementById('siteDiscard').disabled = false;
}

document.getElementById('siteEditor').addEventListener('input', markSiteDirty);
document.getElementById('siteEditor').addEventListener('change', e => {
  markSiteDirty();
  // dispatching needs the orders list: keep the two switches consistent
  if(e.target.dataset.key === 'viewOrders' && !e.target.checked) document.querySelector('.switch[data-key="dispatch"]').checked = false;
  if(e.target.dataset.key === 'dispatch' && e.target.checked) document.querySelector('.switch[data-key="viewOrders"]').checked = true;
});
document.getElementById('siteEditor').addEventListener('click', async e => {
  const tab = e.target.closest('[data-site-tab]');
  if(tab){ collectSiteForm(); siteSection = tab.dataset.siteTab; renderSiteEditor(); return; }
  if(e.target.id === 'siteRestore'){
    if(!confirm('Put this section back to its original settings? Nothing is saved until you press Save changes.')) return;
    siteData.site[siteSection] = JSON.parse(JSON.stringify(siteData.defaults[siteSection]));
    siteDirty = true;
    renderSiteEditor();
    return;
  }
  if(e.target.id === 'siteDiscard'){ loadSiteEditor(); return; }
  if(e.target.id === 'siteSave'){
    collectSiteForm();
    const btn = e.target;
    btn.disabled = true;
    try {
      const data = await api('/api/admin/site', 'PUT', siteData.site);
      siteData.site = data.site;
      siteDirty = false;
      renderSiteEditor();
      toast('Site settings saved');
    } catch(err){
      document.getElementById('siteStatus').innerHTML = `<span style="color:var(--danger)">${esc(err.message)}</span>`;
      btn.disabled = false;
    }
  }
});
// inventory / setup photos
document.getElementById('siteEditor').addEventListener('change', async e => {
  if(e.target.id !== 'galleryUpload') return;
  collectSiteForm();
  const g = siteData.site.content.gallery = siteData.site.content.gallery || [];
  for(const file of e.target.files){
    if(file.size > 5 * 1024 * 1024){ toast(`${file.name} is larger than 5 MB.`, true); continue; }
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/admin/upload-image', { method:'POST', body: fd });
    const data = await res.json();
    if(res.ok) g.push({ src: data.url, caption: '' }); else toast(data.error || 'Upload failed.', true);
  }
  siteDirty = true;
  renderSiteEditor();
});
document.getElementById('siteEditor').addEventListener('click', e => {
  const rm = e.target.closest('[data-gallery-remove]');
  if(!rm) return;
  collectSiteForm();
  siteData.site.content.gallery.splice(Number(rm.dataset.galleryRemove), 1);
  siteDirty = true;
  renderSiteEditor();
});
window.addEventListener('beforeunload', e => { if(siteDirty){ e.preventDefault(); e.returnValue = ''; } });
