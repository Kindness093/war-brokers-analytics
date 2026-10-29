from pathlib import Path
import json,html
root=Path(__file__).resolve().parent.parent
template=(root/'templates/weapon.html').read_text()
weapons=json.loads((root/'data/weapons.json').read_text())
for w in weapons:
 if w['slug']=='ar-rifle':
  w['defaultAccuracy']=21.546585767796305;w['defaultHeadshot']=40.55982025837858
 else:w['defaultAccuracy']=100;w['defaultHeadshot']=0
 r=w.get('range') or {};complete=all(isinstance(r.get(k),(int,float)) for k in ['cliff','plateau','endDamage'])
 end=r.get('plateau') or 250;cliff=r.get('cliff') or 100
 scenario='<option value="published">'+'Wiki graph · labelled endpoints'+'</option>' if complete else ''
 scenario+='<option value="base">Base damage scenario · ignores falloff</option>'
 notes=''
 notes+=' '.join(w['notes'])
 if w['kind']=='shotgun':notes+=' Accuracy here is a MANUAL independent-pellet probability. API hit/fired counters are not applied as pellet probabilities. Shell-by-shell reloads are not modelled.'
 if w['slug']=='crossbow':notes+=' Critical hits have no extra damage. Travel time is excluded; enable reloads for repeated shots.'
 source=f'<a href="{w["sourceUrl"]}">{html.escape(w["name"])} wiki reference</a> · '+('infobox '+w['verifiedVersion'] if w['verifiedVersion'] else 'aggregate reference')+f' · reference infobox values; <a href="{w["rangeSourceUrl"]}">range graph</a> visually checked October 29, 2026.'
 def num(v,suffix=''):
  return 'Unknown' if v is None else f'<span title="{v:.10f}{suffix}">{format(v,".2f").rstrip("0").rstrip(".")}{suffix}</span>'
 stats=[('Base Dmg'+(' (full volley)' if w['kind']=='shotgun' else ''),num(w['baseDamage'])),('Headshot Dmg',num(w['headDamage'])),('Fire rate',num(w['rps'],' rounds/s')),('RPM',num(w['rps']*60 if w['rps'] else None)),('Magazine',num(w['magazine'])),('Reload time',num(w['reload'],'s')),('Swap time',num(w['swap'],'s')),('Run speed',num(w['runSpeed'],'%')),('Theoretical end Dmg' if w.get('projectileLimit') else 'End Dmg',num(r.get('endDamage'))),('Drop-off cliff',num(r.get('cliff'),' m')),('Drop-off plateau',num(r.get('plateau'),' m'))]
 if w['slug']=='ar-rifle':stats += [('Crouch recoil (wiki)',num(80,'%')),('Default zoom',num(2,'×')),('Ammunition','Rifle Ammo'),('Headshot multiplier',num(2,'×'))]
 if w.get('blast'):stats += [('Graph blast Dmg',num(w['blast']['baseDamage'])),('Blast radius',num(w['blast']['radius'],' m'))]
 if w.get('projectileLimit'):stats += [('Projectile limit',num(w['projectileLimit'],' m'))]
 if w.get('pellets'):stats += [('Pellets per shot',num(w['pellets']))]
 stats += [('Damage differential',num(w['baseDamage']-r['endDamage'] if r.get('endDamage') is not None else None))]
 stats += [('Average drop-off rate','<span id="dropRate">—</span>')]
 stats += [('Fire modes',html.escape(' / '.join(w['fireModes']) or 'Unverified'))]
 values={'INTERVAL':200 if end>1000 else 100 if end>500 else 50 if end>300 else 25,'CONFIG':json.dumps(w).replace('</','<\\/'),'NAME':html.escape(w['name']),'CATEGORY':w['category'].upper(),'STATS':''.join(f'<p><strong>{k}:</strong> {v}</p>' for k,v in stats),'SOURCE':source,'MODEL_NOTE':html.escape(notes),'SCENARIOS':scenario,'ID':w['id'],'ACCURACY':w['defaultAccuracy'],'HEADSHOT':w['defaultHeadshot'],'ACCURACY_LABEL':f'{w["defaultAccuracy"]:.2f}','HEADSHOT_LABEL':f'{w["defaultHeadshot"]:.2f}','MAGAZINE':w['magazine'],'RPS':w['rps'],'RELOAD':w['reload'],'END':end,'CLIFF':cliff}
 page=template
 page=page.replace('id="engagementRange" type="number" min="0" max="{{END}}" step="1" value="150"',f'id="engagementRange" type="number" min="0" max="{{{{END}}}}" step="1" value="{min(150,end)}"')
 for key,val in values.items():page=page.replace('{{'+key+'}}',str(val))
 if not complete:
  page=page.replace('Include drop-off plateau ('+str(end)+' m)','Include analysis endpoint ('+str(end)+' m)').replace('Start at drop-off cliff ('+str(cliff)+' m)','Start at '+str(cliff)+' m').replace('Damage falloff follows the wiki graph labels.','Falloff is ignored in the base-damage scenario.')
 if w['kind']=='shotgun':page=page.replace('Base accuracy (hits / shots fired, %)','Pellet accuracy (manual scenario, %)')
 if w['kind']=='explosive':
  blast=w['blast']; radius=blast['radius']; damage=blast['baseDamage']
  blastSvg=f'<section><h2>Blast damage by distance</h2><p class="hint">Distance is measured from the explosion. This is not shooter-to-target range.</p><svg viewBox="0 0 1000 360" role="img" aria-label="Blast damage falls from {damage} at the explosion to zero at {radius} metres" style="width:100%;background:#292929"><path d="M80 30V300H940" fill="none" stroke="#888"/><path d="M80 50L900 300H940" fill="none" stroke="#efbb43" stroke-width="2"/><path d="M900 30V300" stroke="#efbb43" stroke-dasharray="5 4"/><g fill="#efbb43" font-size="16"><text x="65" y="55" text-anchor="end">{damage}</text><text x="65" y="300" text-anchor="end">0</text><text x="80" y="325" text-anchor="middle">0m</text><text x="900" y="325" text-anchor="middle">{radius}m</text><text x="500" y="350" text-anchor="middle">Distance from explosion (m)</text></g></svg></section>'
  page=page.replace('<div class="setup-grid">',blastSvg+'<div class="setup-grid">',1)
  page=page.replace('</head>','<style>.setup-grid,.view-options,#samplingSummary,#graphSection,#tableSection,#engagementResults,main>section:has(#engagementRange),.definitions {display:none;}</style></head>')
  page=page.replace('<div class="setup-grid">','<p class="hint">Point-target TTK, pellet/bullet accuracy and kill-probability charts are unavailable for this explosive. Blast geometry, detonation, lock-on and projectile timing require a separately verified model.</p><div class="setup-grid">')
 (root/'weapons'/f'{w["slug"]}.html').write_text(page)
# Build the navigation from the same catalog.
header=template.split('<main>')[0].replace('{{NAME}}','Weapons')
header=header.replace('AR Rifle Analytics','Weapons').replace('/ Weapons','/ Weapons')
# The index needs no runtime configuration or generated control placeholders.
body='<main class="armoury-page"><div class="page-title"><p class="eyebrow">ARMOURY</p><h1>Weapons</h1><p>Browse weapons by slot and type. Select a heading to expand or collapse its list.</p></div>'
body+='<details class="armoury-group" open><summary><h2>Primary weapons</h2><span class="group-count">'+str(len(weapons))+' weapons</span></summary>'
for category in dict.fromkeys(w['category'] for w in weapons):
 group=[w for w in weapons if w['category']==category]
 body+=f'<details class="weapon-type" open><summary><h3>{category}</h3><span class="group-count">{len(group)}</span></summary><ul class="armoury-list">'
 for w in group:
  body+=f'<li><a href="{w["slug"]}.html"><strong>{html.escape(w["name"])}</strong><span>Reference statistics and weapon analysis</span></a></li>'
 body+='</ul></details>'
body+='</details>'
sections=json.loads((root/'data/armoury-sections.json').read_text())
for heading,names in sections.items():
 body+=f'<details class="armoury-group"><summary><h2>{heading}</h2><span class="group-count">{len(names)} weapons</span></summary><p class="hint">Analysis pages for this section have not been added yet.</p><ul class="armoury-list reference-list">'
 for name in names:body+=f'<li><strong>{html.escape(name)}</strong></li>'
 body+='</ul></details>'
body+='<p class="hint">Source: <a href="https://war-brokers.fandom.com/wiki/Weapons">War Brokers Wiki weapon list</a>. The grenades section also includes deployables such as the Laser Trip Mine.</p></main><footer>War Brokers Analytics · Unofficial community project</footer></body></html>'
(root/'weapons/index.html').write_text(header+body)
print(f'Built {len(weapons)} weapon pages and armoury index.')
