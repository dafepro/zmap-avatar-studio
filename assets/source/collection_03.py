"""Three additional hair assets from isolated four-view Collection 03 studies.

Styles share the qualified scalp and accessory contracts. No head-specific or
hat-specific copies are authored; the appearance matrix qualifies the exports.
"""
HAIR_03={
    'nova':{'label':'Nova ponytail','color':'#aa6031','nape':-.115},
    'halo':{'label':'Halo afro','color':'#5b3e2e','nape':-.130,
            'frontal_hairline':[(0,.130),(.35,.137),(.65,.130),(.9,.118),(1.1,.09),(1.25,.018)]},
    'reed':{'label':'Reed waves','color':'#70513d','nape':-.145,
            'frontal_hairline':[(0,.12),(.38,.165),(.85,.09),(1.25,.018)]},
}
for style,spec in HAIR_03.items():
    module=ROOT/'assets/source'/('hair_'+style+'.py')
    exec(compile(module.read_text(),str(module),'exec'),globals())
    root,record=asset('hair-'+style,spec['label'],'hair','Collection 03: '+spec['label']+' authored from isolated front, side, back and top concepts. One qualified source for the full reference head and accessory family.')
    record['tags']=['hair-study-03']
    parent=mount(root,record,'head')
    scalp_foundation(parent,spec['label'],nape=spec['nape'],frontal_hairline=spec.get('frontal_hairline'))
    globals()['build_'+style+'_hair'](parent)
    export(root,record)
