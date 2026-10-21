# Prepared owned XRDP desktop; fixed scalar receipts and one-Hz visible updates.
import json
import tkinter as tk
root = tk.Tk()
root.title('Bridge owned XRDP acceptance')
root.geometry('1920x1080+0+0')
root.attributes('-fullscreen', True)
canvas = tk.Canvas(root, background='#d9efff', highlightthickness=0, scrollregion=(0, 0, 4096, 4096))
canvas.pack(fill='both', expand=True)
result = tk.Entry(root)
result.pack(fill='x')
for y in range(0, 4096, 256):
    for x in range(0, 4096, 256):
        canvas.create_rectangle(x, y, x + 255, y + 255, fill='#cfe8ff' if (x + y) // 256 % 2 else '#ffe4b8', outline='#536980')
        canvas.create_text(x + 20, y + 30, text=f'Bridge owned XRDP {x},{y}', anchor='nw', fill='#182f44')
canvas.create_text(1400, 1300, text='Local test desktop / fixed scalar readback', font=('DejaVu Sans', 22), fill='#182f44')
state = dict(v=1, fixture='bridge-pointer-v1', down=[0, 0, 0], up=[0, 0, 0], moves=0, dragX=0, dragY=0, wheel=dict(left=0, right=0, up=0, down=0), buttons=0)
drag_item = canvas.create_rectangle(1536, 1280, 1791, 1535, fill='#b8304c', outline='#400d1b', tags=('drag-object',))
canvas.create_text(1663, 1407, text='Drag this tile', fill='white', tags=('drag-object',))
drag = None
bits = {1: 1, 2: 4, 3: 2}
indexes = {1: 0, 2: 1, 3: 2}

def inc(n):
    return min(65535, n + 1)

def press(event):
    global drag
    canvas.focus_set()
    if event.num in indexes:
        state['down'][indexes[event.num]] = inc(state['down'][indexes[event.num]])
        state['buttons'] |= bits[event.num]
        if event.num == 1:
            if 'drag-object' in canvas.gettags('current'):
                drag = (event.x, event.y, *canvas.coords(drag_item)[:2])
            else:
                drag = None
    elif event.num in (4, 5, 6, 7):
        before = (canvas.xview(), canvas.yview())
        horizontal = event.num in (6, 7) or bool(event.state & 1)
        if not horizontal:
            canvas.yview_scroll(-3 if event.num == 4 else 3, 'units')
        else:
            canvas.xview_scroll(-3 if event.num in (4, 6) else 3, 'units')
        after = (canvas.xview(), canvas.yview())
        if before != after:
            name = ('left' if event.num in (4, 6) else 'right') if horizontal else ('up' if event.num == 4 else 'down')
            state['wheel'][name] = inc(state['wheel'][name])

def release(event):
    global drag
    if event.num not in indexes:
        return
    state['up'][indexes[event.num]] = inc(state['up'][indexes[event.num]])
    state['buttons'] &= ~bits[event.num]
    if event.num == 1:
        if drag:
            position = canvas.coords(drag_item)
            # Publish completed item displacement only after its actual drop.
            state['dragX'] = min(65535, max(state['dragX'], round(abs(position[0] - drag[2]))))
            state['dragY'] = min(65535, max(state['dragY'], round(abs(position[1] - drag[3]))))
        drag = None

def motion(event):
    global drag
    state['moves'] = inc(state['moves'])
    if drag and state['buttons'] & 1:
        canvas.move('drag-object', event.x - drag[0], event.y - drag[1])
        drag = (event.x, event.y, drag[2], drag[3])

def snapshot(event):
    result.delete(0, 'end')
    result.insert(0, json.dumps(state, separators=(',', ':')))
    result.focus_set()
    result.selection_range(0, 'end')
    return 'break'
canvas.bind('<ButtonPress>', press)
canvas.bind('<ButtonRelease>', release)
canvas.bind('<Motion>', motion)
root.bind('<F2>', snapshot)
root.after(500, lambda: (canvas.xview_moveto(0.25), canvas.yview_moveto(0.25), canvas.focus_set()))
marker = tk.Label(root, text='Bridge active desktop 0', font=('DejaVu Sans', 18), padx=16, pady=8)
marker.place(x=16, y=16)
tick = 0

def animate():
    global tick
    tick = (tick + 1) % 65536
    marker.configure(text=f'Bridge active desktop {tick}', background='#cfe8ff' if tick % 2 else '#ffe4b8')
    root.after(1000, animate)
root.after(1000, animate)
root.mainloop()
