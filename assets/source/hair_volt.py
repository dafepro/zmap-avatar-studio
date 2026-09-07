"""Broad, closed swept quiff volumes from the isolated four-view Volt study.

Each lock has a filled underside, a curved asymmetric ridge and tapered tip.
Pigment follows the hair palette; the cropped foundation stays independent.
"""
def build_volt_hair(parent):
    # The swept silhouette has a continuous interior. Surface locks overlap
    # this crown volume, so opposing front/back flows cannot expose air slots.
    crown=smooth(rings('Volt continuous swept crown',[
        (.083,.149,.159,-.015),(.145,.191,.190,-.024),
        (.220,.172,.223,-.040),(.277,.132,.206,-.066),
        (.323,.081,.147,-.110),(.354,.034,.060,-.174),
        (.369,.006,.008,-.206),
    ],hair,parent,n=16))
    pigment=crown.data.color_attributes.new(name='Hair pigment',type='FLOAT_COLOR',domain='CORNER')
    for color in pigment.data:color.color=(.72,.72,.72,1)
    # Front roots share the forehead. Unequal diagonal sweeps fill the crown;
    # the outer locks turn down around it instead of becoming upright fins.
    paths=[
        ([(-.036,.099,.193),(-.137,.145,.223),(-.240,.191,.057),(-.298,.232,-.020)],.081,.036),
        ([(-.018,.105,.197),(-.104,.202,.244),(-.231,.257,-.067),(-.282,.333,-.174)],.090,.039),
        ([(.002,.103,.202),(-.032,.256,.242),(-.122,.318,-.083),(-.154,.401,-.243)],.093,.042),
        ([(.030,.108,.194),(.053,.245,.244),(.086,.307,-.097),(.053,.376,-.265)],.086,.041),
        ([(.072,.111,.177),(.149,.205,.175),(.197,.246,-.100),(.193,.308,-.248)],.075,.036),
        ([(.134,.115,.118),(.208,.141,.080),(.234,.182,-.099),(.257,.218,-.220)],.054,.028),
        # The same flow continues down the occipital crown, filling the rear
        # volume. A quiff is not just a row of plumes above a bald back panel.
        ([(-.01,.021,-.192),(-.132,.098,-.232),(-.203,.240,-.227),(-.225,.312,-.236)],.081,.018),
        ([(.015,.018,-.187),(-.024,.108,-.255),(-.010,.273,-.258),(-.067,.374,-.253)],.110,.021),
        ([(.028,.024,-.183),(.161,.109,-.228),(.179,.238,-.229),(.177,.293,-.249)],.078,.018),
    ]
    steps=[0,.12,.26,.42,.59,.75,.9,1]
    section=[(-1,0),(-.69,.68),(-.18,1),(.38,.84),(1,0),(.54,-1.2),(0,-1.8),(-.6,-1.05)]
    for index,(points,width,depth) in enumerate(paths):
        control=[Vector(p) for p in points];verts=[];faces=[];values=[]
        for t in steps:
            u=1-t
            centre=control[0]*u**3+control[1]*(3*u*u*t)+control[2]*(3*u*t*t)+control[3]*t**3
            tangent=((control[1]-control[0])*(3*u*u)+(control[2]-control[1])*(6*u*t)+(control[3]-control[2])*(3*t*t)).normalized()
            across=(Vector((1,0,0))-tangent*tangent.x).normalized()
            normal=across.cross(tangent).normalized()
            if index>=6:normal=-normal
            fullness=math.sin(math.pi*t)**.57
            w=width*fullness+.018*u+.0006*t
            h=depth*fullness*(1-.62*ease(.63,1,t))+.010*u+.0006*t
            for column,(x,y) in enumerate(section):
                verts.append(tuple(centre+across*(x*w)+normal*(y*h)))
                # Broad ink-like washes emphasize the flow without encoding
                # a clothing color or a dense triangulated shadow pattern.
                values.append([.56,.88,1,.92,.58,.52,.46,.54][column])
        n=len(section)
        for row in range(len(steps)-1):
            for j in range(n):
                a=row*n+j;b=row*n+(j+1)%n;faces.append((a,b,b+n,a+n))
        faces.extend([tuple(reversed(range(n))),tuple(range((len(steps)-1)*n,len(steps)*n))])
        obj=smooth(mesh('Volt · flowing solid lock '+str(index+1),verts,faces,hair,parent))
        pigment=obj.data.color_attributes.new(name='Hair pigment',type='FLOAT_COLOR',domain='CORNER')
        for loop in obj.data.loops:
            shade=values[loop.vertex_index];pigment.data[loop.index].color=(shade,shade,shade,1)
