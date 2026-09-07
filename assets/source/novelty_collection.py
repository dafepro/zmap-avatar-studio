"""Three playful assets using the existing headwear, eyewear and effect slots."""
NOVELTY={
    'quack':{'id':'hat-quack-captain','label':'Quack Captain','slot':'headwear','socket':'head','builder':'build_quack','module':'novelty_quack.py'},
    'starstruck':{'id':'acc-starstruck','label':'Starstruck Specs','slot':'eyewear','socket':'head','builder':'build_starstruck','module':'novelty_specs.py'},
    'galaxy':{'id':'effect-pocket-galaxy','label':'Pocket Galaxy','slot':'effect','socket':'root','builder':'build_pocket_galaxy','module':'novelty_galaxy.py'},
}
for key,spec in NOVELTY.items():
    module=ROOT/'assets/source'/spec['module']
    exec(compile(module.read_text(),str(module),'exec'),globals())
    root,record=asset(spec['id'],spec['label'],spec['slot'],
                      'Playful original accessory authored from a four-view study. Single source geometry and existing fitting contracts.')
    record['tags']=['novelty-collection']
    parent=mount(root,record,spec['socket'])
    globals()[spec['builder']](parent)
    if key=='quack':
        record['hairFit']=[{'targetSlot':'hair','mode':'contain','center':[0,.1125,-.0096],
                           'radii':[.2097144,.1908,.2024],'transition':[-.054,.0675]}]
    elif key=='starstruck':
        record['fit']={'targetSlot':'head','surface':'face-v2','frame':FRAME,'mode':'clearance',
                       'offset':.016,'maxDistance':.085,'projection':'wrap','sideOffset':.003}
        record['hairFit']=[{'targetSlot':'hair','mode':'occlude'}]
    else:record['effect']='orbit'
    export(root,record)
