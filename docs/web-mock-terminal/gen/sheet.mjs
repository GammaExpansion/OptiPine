// G5: colours, type, controls and the recurring states on one sheet.
import * as X from './x.mjs';
import * as P from './panels.mjs';
import * as O from './over.mjs';
import {
  I,
  dot,
  seg,
  sw,
  cb,
  select,
  numField,
  rmChip,
  addChip,
  status,
  runBtn,
  cancelBtn,
} from './ui.mjs';

const swatch = (c, role) =>
  `<div style="display: flex; align-items: center; gap: 10px"><span style="width: 28px; height: 28px; border-radius: 4px; background: ${c}; border: 1px solid #2f353c; flex: none"></span><span style="display: flex; flex-direction: column"><span>${role}</span><span class="t3 num" style="font-size: 12px">${c}</span></span></div>`;
const blk = (title, body) =>
  `<div style="display: flex; flex-direction: column; gap: 12px; min-width: 0"><span style="font-size: 12px; color: #7f8790; border-bottom: 1px solid #23272d; padding-bottom: 6px">${title}</span>${body}</div>`;
const st = (label, body) =>
  `<div style="display: flex; align-items: center; gap: 12px; min-height: 32px"><span class="t3" style="width: 64px; font-size: 12px; flex: none">${label}</span>${body}</div>`;
const col = (...rows) =>
  `<div style="display: flex; flex-direction: column; gap: 10px">${rows.join('')}</div>`;
const type = (sample, note) =>
  `<div style="display: flex; align-items: baseline; gap: 12px">${sample}<span class="t3" style="font-size: 12px">${note}</span></div>`;
const foot = (big, sub, off) =>
  `<div style="background: #14171b; border: 1px solid #23272d"><div style="padding: 14px 16px 16px; display: flex; align-items: center; gap: 12px"><div class="num" style="flex: 1; display: flex; flex-direction: column; gap: 2px"><div style="display: flex; align-items: baseline; gap: 6px"><span style="font-size: 20px; font-weight: 600">${big}</span><span class="t2">组</span></div>${sub}</div><button class="primary${off ? ' off' : ''}" style="height: 36px; padding: 0 16px">${I.play()}开始优化</button></div></div>`;
const ok = I.check(12, '#3fbf8a');

export const sheet = `<div style="width: 1440px; height: 1120px; background: #0e1013; color: #e8eaed; padding: 36px 40px; display: flex; flex-direction: column; gap: 36px; overflow: hidden">
<div style="display: grid; grid-template-columns: 400px 400px minmax(0, 1fr); gap: 48px">
${blk('底色与文字', `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">${swatch('#0e1013', '画布')}${swatch('#14171b', '面板')}${swatch('#0f1215', '输入框')}${swatch('#1b1f24', '菜单、悬停')}${swatch('#23272d', '分隔线')}${swatch('#2f353c', '控件描边')}${swatch('#e8eaed', '正文')}${swatch('#aab1b9', '次要文字')}${swatch('#7f8790', '说明文字')}</div>`)}
${blk(
  '含义色',
  `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">${swatch('#f2a33a', '主操作、选中、样本外')}${swatch('#6cb6dd', '样本内')}${swatch('#3fbf8a', '盈利、做多')}${swatch('#f06a5d', '亏损、做空、错误')}${swatch('#2bb3a3', '脚本主曲线')}${swatch('#8fb8de', '不支持、副图')}</div>
<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px"><span class="t2" style="font-size: 12px">热力图色阶由亏损至盈利，零值位于第三、四格之间</span><div style="display: flex; gap: 2px">${X.HEAT_COLORS.map((c) => `<span style="flex: 1; height: 14px; background: ${c}"></span>`).join('')}</div></div>`,
)}
${blk(
  '字',
  col(
    type(
      '<span class="num" style="font-size: 22px; font-weight: 600">+18,420.35</span>',
      '22 / 600　关键数字',
    ),
    type(
      '<span style="font-size: 15px; font-weight: 600">选择行情</span>',
      '15 / 600　弹窗标题、空状态',
    ),
    type('<span style="font-weight: 600">搜索范围</span>', '13 / 600　分区标题'),
    type('<span>Length 28，Multiplier 2.00</span>', '13 / 400　正文、控件'),
    type(
      '<span class="t2" style="font-size: 12px">20,488 根 K 线，用时 1.9 秒</span>',
      '12　说明、表头',
    ),
    type('<span class="code">ta.sma(src, length)</span>', '12.5　等宽，仅用于代码'),
    '<span class="t3" style="font-size: 12px; line-height: 1.5">Barlow 搭配 Noto Sans SC。数字采用等宽数字（tabular-nums）对齐，不使用等宽字体。</span>',
  ),
)}
</div>
<div style="display: grid; grid-template-columns: 400px 400px minmax(0, 1fr); gap: 48px">
${blk(
  '输入',
  col(
    st('数值', `<div style="width: 200px">${numField('s1', '20')}</div>`),
    st('聚焦', `<div style="width: 200px">${numField('s2', '28', { foc: true })}</div>`),
    st(
      '出错',
      `<div style="width: 200px; display: flex; flex-direction: column; gap: 4px">${numField('s3', '0', { err: true })}<span class="errt">不能小于 0.25</span></div>`,
    ),
    st(
      '只读',
      `<div style="width: 200px"><div class="field" style="opacity: 0.55"><span class="v">14</span></div></div><span class="t3" style="font-size: 12px; display: flex; gap: 4px; align-items: center">${I.lock(11)}表达式</span>`,
    ),
    st('下拉', `<div style="width: 200px">${select('close')}</div>`),
    st(
      '范围',
      '<input class="mini" value="10" aria-label="从" style="width: 56px"><span class="t3">至</span><input class="mini" value="50" aria-label="到" style="width: 56px"><span class="t3">步长</span><input class="mini" value="1" aria-label="步长" style="width: 44px">',
    ),
  ),
)}
${blk(
  '选择',
  col(
    st('开关', `${sw(false, '关')}${sw(true, '开')}`),
    st('勾选', `${cb(false, '未选')}${cb(true, '已选')}`),
    st('分段', seg(['不验证', '样本内 / 外', '滚动窗口'], 1)),
    st(
      '取值',
      '<button class="chip on">close</button><button class="chip on">hl2</button><button class="chip">open</button>',
    ),
    st('条件', `${rmChip('交易数 ≥ 5')}${rmChip('盈利因子 ≥ 2.5', 'bad')}${addChip()}`),
    st(
      '标记',
      '<span class="tag">+5</span><span class="tag am">已过期</span><span class="tag dn">编译错误</span><span class="tag bl">不支持</span>',
    ),
  ),
)}
${blk(
  '按钮',
  col(
    st(
      '主操作',
      `${runBtn({ kbd: true })}<button class="primary" style="background: #f6b04d">${I.play()}开始优化</button>${runBtn({ off: true, kbd: false })}`,
    ),
    st(
      '次操作',
      `<button class="ghost">重新优化</button><button class="ghost" style="background: #1b1f24">完整回测</button>${cancelBtn()}`,
    ),
    st(
      '图标',
      `<button class="iconbtn" aria-label="导出">${I.dl()}</button><button class="iconbtn" style="background: #1b1f24; color: #e8eaed" aria-label="重置缩放">${I.fit()}</button><button class="iconbtn on" aria-label="成交标记">${I.marks()}</button><span class="t3" style="font-size: 12px">默认、悬停、开启</span>`,
    ),
    st('链接', '<a href="#">全部设置</a><a href="#" class="dn">2 组，查看</a>'),
    st(
      '菜单',
      `<div class="menu" style="position: static; width: 220px"><button class="mi on">${I.dl(14)}<span style="flex: 1">排行 CSV</span><span class="t3 num" style="font-size: 12px">2,163 行</span></button><button class="mi">${I.dl(14)}<span style="flex: 1">成交 CSV</span></button><button class="mi">${I.copy()}<span style="flex: 1">复制选中参数</span></button></div>`,
    ),
  ),
)}
</div>
<div style="display: grid; grid-template-columns: 560px 336px 336px; gap: 48px">
${blk(
  '顶栏右侧的运行状态',
  col(
    st('空闲', status('<span class="t3">20,488 根 K 线，用时 1.9 秒</span>') + runBtn()),
    st('运行中', status(`${I.spin()}<span>运行中，已用时 1.2 秒</span>`) + cancelBtn()),
    st(
      '已过期',
      status(`${dot('#f2a33a')}<span class="am">参数已修改，结果尚未更新</span>`) + runBtn(),
    ),
    st('失败', status('<span class="dn">编译失败，2 个错误</span>') + runBtn({ off: true })),
    st(
      '优化后',
      status(
        '<span class="t3">优化 2,214 组，用时 10:09</span><a href="#" class="dn">2 组报错</a>',
      ) + '<button class="ghost">重新优化</button>',
    ),
    st('优化中', status(`${I.spin()}<span>优化中 1,373 / 2,214</span>`) + cancelBtn('取消优化')),
  ),
)}
${blk('优化运行块：待运行', foot('2,214', '<span class="t3" style="font-size: 12px">约 10 分钟，7 个线程</span>') + foot('—', '<span class="errt">请先修正上方 2 处错误</span>', true))}
${blk('优化运行块：运行中', `<div style="background: #14171b; border: 1px solid #23272d">${P.progressBlock()}</div>`)}
</div>
${blk(
  '提示条：底部居中显示，数秒后自动消失；含操作按钮的需手动关闭',
  `<div style="display: flex; flex-wrap: wrap; gap: 12px">
${O.toast(`${ok}<span>已应用 #1 的参数并重新回测</span><button class="ghost" style="height: 28px">撤销</button>`, 'position: static')}
${O.toast(`${ok}<span>参数已复制</span>`, 'position: static; padding-right: 14px')}
${O.toast(`${ok}<span>已导出 排行.csv，2,163 行</span>`, 'position: static; padding-right: 14px')}
${O.toast(`${I.warn(14)}<span>脚本已修改，上次结果已失效</span>`, 'position: static; padding-right: 14px')}
${O.toast(`${I.warn(14)}<span>优化已取消，已保留上次完整结果</span>`, 'position: static; padding-right: 14px')}
${O.toast(`${I.err(14)}<span>计算线程异常退出，结果未保留</span><button class="ghost" style="height: 28px">重新运行</button>`, 'position: static')}
</div>`,
)}
</div>`;
