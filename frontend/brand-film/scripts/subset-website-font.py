from pathlib import Path
import sys
from fontTools import subset

root = Path(__file__).resolve().parent.parent
target = Path(sys.argv[1]) / 'fonts'
target.mkdir(exist_ok=True)
text = ''.join(p.read_text(encoding='utf-8') for p in (root / 'src').rglob('*.tsx'))
text += (root / 'src/design.ts').read_text(encoding='utf-8')
text += ''.join(chr(i) for i in range(32, 127))
options = subset.Options()
options.layout_features = ['*']
font = subset.load_font(str(root / 'public/fonts/NotoSansSC.ttf'), options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
subset.save_font(font, str(target / 'NotoSansSC.ttf'), options)
print('Website font subset:', (target / 'NotoSansSC.ttf').stat().st_size, 'bytes')
