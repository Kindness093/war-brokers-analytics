from pathlib import Path
root=Path(__file__).resolve().parent.parent
template=(root/'templates/weapon.html').read_text()
base=template.split('<main>')[0]
common='''<details class="lab-assumptions" open><summary><h2>Aim and timing</h2></summary><div class="lab-controls">
<div class="lab-field"><label for="accuracy">Accuracy (%)</label><input id="accuracy" type="number" min="0" max="100" step="0.1" value="21.546585767796305"></div>
<div class="lab-field"><label for="headshot">Headshot frequency (% of hits)</label><input id="headshot" type="number" min="0" max="100" step="0.1" value="40.55982025837858"></div>
<div class="lab-field"><label for="rangeModel">Range scenario</label><select id="rangeModel"><option value="published">Weapon damage curve</option><option value="base">Base damage · ignores falloff</option></select></div>
<div class="lab-field"><label for="pattern">Firing pattern</label><select id="pattern"><option value="standard">Uniform firing</option><option value="burst">Custom burst timing</option></select></div>
<div class="lab-field"><label for="burstSize">Custom burst size</label><input id="burstSize" type="number" min="2" max="12" step="1" value="3"></div>
<div class="lab-field"><label for="burstGap">Last shot to next burst (s)</label><input id="burstGap" type="number" min="0.001" max="120" step="0.01" value="0.4"></div>
<label><input id="reloads" type="checkbox"> Include reloads in graph TTK and percentiles</label>
</div><p class="hint">Shared manual aim scenario, applied equally to each weapon. Shotguns interpret accuracy as independent pellet probability. Custom burst timing is a scenario, not a wiki measurement.</p></details>
<details class="lab-assumptions" open><summary><h2>Range and graph settings</h2></summary><div class="lab-controls">
<div class="lab-field"><label for="metric">Graph metric</label><select id="metric"></select></div>
<div class="lab-field"><label for="maxDistance">Graph endpoint (m)</label><input id="maxDistance" type="number" min="0.01" max="5000" step="0.01" value="205"></div>
<div class="lab-field"><label for="interval">Interval (m)</label><input id="interval" type="number" min="0.1" max="5000" step="0.1" value="25"></div>
<div class="lab-field"><label for="count">Sample count per weapon</label><input id="count" type="number" min="2" max="20" step="1" value="8"></div>
<label><input id="includeEndpoint" type="checkbox" checked> Include endpoint</label><label><input id="evenSpacing" type="checkbox"> Evenly space samples</label><label><input id="showBoundaries" type="checkbox"> Show cliffs and plateaus</label>
</div><p class="hint">Point datasets</p><div id="point-datasets" class="control-row"></div><p class="view-options"><label><input id="showGraph" type="checkbox" checked> Show graph</label><label><input id="showTable" type="checkbox" checked> Show range table</label></p></details>'''
outputs='''<div id="lab-errors" role="alert" hidden></div>
<section class="lab-output"><h2>Performance by range</h2><p class="hint"><span id="distance-label">Shooter distance</span> on a common axis. Hover over points or values for ten decimal places. Lines stop where a model is unavailable.</p><div id="chart-output"></div></section>
<section id="range-section" class="lab-output"><h2>Range outputs</h2><div id="range-output"></div></section>
<section class="lab-output"><h2>Engagement analysis</h2><div class="lab-controls"><div class="lab-field"><label for="engagementDistance">Engagement distance (m)</label><input id="engagementDistance" type="number" min="0" max="5000" step="0.01" value="100"></div><div class="lab-field"><label for="timeTarget">Time target (s)</label><input id="timeTarget" type="number" min="0" max="60" step="0.1" value="2"></div></div><div id="engagement-output"></div></section>
<section class="lab-output"><h2>Export analysis</h2><div class="tool-actions"><button id="export-csv" type="button" disabled>Export CSV</button><button id="export-png" type="button" disabled>Export PNG</button><button id="export-svg" type="button" disabled>Export SVG</button></div><p class="hint">Exports include weapon stats, aim settings, the graph (images), range outputs and engagement results. CSV values retain ten decimal places.</p><p id="export-status" role="status"></p></section>
<details class="lab-notes"><summary>Model notes</summary><div id="model-notes"></div></details>'''
for mode,title,intro in [('compare','Compare weapons','Choose up to three weapons. Compare the same metric, distance and aim scenario.'),('calculator','Weapon calculator','Start with a primary weapon, edit its stats, and export your custom analysis.')]:
 modeattr='comparison' if mode=='compare' else mode
 header=base.replace('{{NAME}}',title).replace(title+' Analytics |',title+' |').replace('<body>',f'<body data-tool="{modeattr}">').replace('</head>','<link rel="stylesheet" href="../lab.css"></head>')
 body=f'<main><div class="page-title"><p class="eyebrow">ARMOURY / TOOLS</p><h1>{title}</h1><p>{intro}</p></div><nav class="tool-nav" aria-label="Weapon tools"><a href="index.html">Armoury</a><a href="compare.html">Compare weapons</a><a href="calculator.html">Weapon calculator</a></nav><form id="lab-form" novalidate>'
 if mode=='compare':body+='<section class="lab-selection"><h2>Weapons</h2><div id="weapon-slots"></div><button id="add-weapon" type="button">Add weapon</button><p class="hint">Maximum three. Yellow, red and orange identify the three series. Explosive weapons can be compared together on blast distance, but cannot share a range axis with firearms.</p></section>'+common
 else:body+='''<section class="lab-selection"><h2>Starting template</h2><div class="tool-actions"><label for="preset">Primary weapon</label><select id="preset"></select><button id="reset-preset" type="button">Restore template</button><button id="compare-custom" type="button">Compare this scenario</button></div><p class="hint">Selecting a template replaces the editor values. All fields remain editable; your changes stay in this page until exported.</p></section><div class="lab-workspace"><aside class="lab-editor"><h2>Editable stats</h2><div id="editor-fields" class="editor-fields"></div><p class="hint">Blank optional fields stay unknown. Headshot damage can be edited freely; exact probabilistic metrics currently support 1×, 2×, 3× and 4× multipliers. Blast distance is measured from the explosion; the cliff field can model a constant-damage inner radius.</p></aside><div class="lab-preview"><section id="preview-summary" class="reference-strip"></section>'''+common+'</div></div>'
 body+=outputs+'</form></main><footer>War Brokers Analytics · Unofficial community project</footer><script type="module" src="../tool-page.mjs"></script></body></html>'
 (root/'weapons'/f'{mode}.html').write_text(header+body)
