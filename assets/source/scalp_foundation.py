"""Shared scalp foundation for the complete reference head family.

This uses the same asymmetric skull sections and angular sampling as make_head.
Every silhouette breakpoint is a ring: the back cannot be approximated by one
long triangle spanning forehead-height to nape. Styling transforms operate only
on locks, never this fit surface. New heads must pass the family coverage suite.
"""
HEAD_FAMILY_WIDTH = 1.065

def scalp_foundation(parent, label, nape=-.115, undercut=False, root_pigment=.13):
    n=32
    # Hairline is an intentional design boundary; skull coverage above it is
    # structural. Temple ends stay above ears; the posterior extends to nape.
    line=[(0,.082),(.9,.066),(1.25,.018),(1.57,-.006),(1.90,-.058),(2.35,nape),(math.pi,nape)]
    def boundary(angle):
        a=min(angle,math.tau-angle)
        for left,right in zip(line,line[1:]):
            if a<=right[0]:
                t=(a-left[0])/(right[0]-left[0]);return left[1]+(right[1]-left[1])*t
        return nape
    ys=sorted(set([nape]+[row[0] for row in HEAD if row[0]>nape]+[.052,.13,.185]))
    vs=[];fs=[]
    for row,y in enumerate(ys):
        for j in range(n):
            a=j*math.tau/n;sample=max(y,boundary(a))
            rx,front,back=head_section(sample);mid=(front+back)*.5
            x=math.sin(a)*rx
            z=face_depth(x,sample) if math.cos(a)>0 else mid+math.cos(a)*(front-back)*.5
            # Normal-direction radial margin encloses the widest authored head,
            # including polygon interiors. Height is lifted only at the crown.
            x=x*HEAD_FAMILY_WIDTH*1.045+math.sin(a)*.003
            z=mid+(z-mid)*1.055+math.cos(a)*.005
            lift=.009*ease(.185,.23,sample)
            vs.append((x,sample+lift,z))
    for row in range(len(ys)-1):
        for j in range(n):
            a=row*n+j;b=row*n+(j+1)%n
            fs.append((a,b,b+n,a+n))
    fs.append(tuple(range((len(ys)-1)*n,len(ys)*n)))
    scalp=mesh('Head-derived scalp · '+label,vs,fs,hair,parent)
    bm=bmesh.new();bm.from_mesh(scalp.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
    bm.normal_update();bm.to_mesh(scalp.data);bm.free()
    # Coverage topology is for fit, not a visible faceted haircut. Smooth
    # normals keep cropped sides coherent while sculpted locks carry the style.
    smooth(scalp)
    scalp['scalpFoundation']=True
    if undercut:
        # Root pigment belongs to the hair channel. Clothing/accessory palette
        # changes must never recolor the shaved sides of a hairstyle.
        pigment=scalp.data.color_attributes.new(name='Hair pigment',type='FLOAT_COLOR',domain='CORNER')
        for poly in scalp.data.polygons:
            shade=root_pigment if sum(scalp.data.vertices[i].co.z for i in poly.vertices)/len(poly.vertices)<.115 else 1
            for loop in poly.loop_indices:pigment.data[loop].color=(shade,shade,shade,1)
    return scalp
