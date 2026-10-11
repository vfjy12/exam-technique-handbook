const {Plugin,ItemView,Modal,Setting,Notice,MarkdownRenderer,Component}=require('obsidian');
const TYPE='exam-technique-handbook-view';
const ROOT='技巧宝典';
const id=()=>globalThis.crypto.randomUUID();
function documentFor(kind,value){
  const data={note_type:kind,entity_id:id(),teacher:value.teacher||'',parent_id:value.parent||'',source_note:value.source||'',question_note:value.question||'',evidence_role:value.role||'老师原讲解',created_at:new Date().toISOString()};
  const yaml=Object.entries(data).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n');
  let body;
  if(kind==='technique_analysis')body=`## 分析对象\n${value.question?'[['+value.question+']]':'待关联原题'}\n\n## 题干标注\n\n## 问题标注\n\n## 选项 A 标注\n\n## 选项 B 标注\n\n## 选项 C 标注\n\n## 选项 D 标注\n\n## 分析与应用\n${value.content||''}\n\n## 关联技巧\n`;
  else if(kind==='technique_lecture')body=`## 讲义来源\n${value.source?'[['+value.source+']]':'待补充'}\n\n## 完整讲义内容\n${value.content||''}\n\n## 方法体系\n`;
  else body=`## 方法与步骤\n${value.content||''}\n\n## 适用条件\n\n## 失败场景与边界\n\n## 讲义来源\n${value.source?'[['+value.source+']]':'待补充'}\n\n## 例题链接\n`;
  return `---\n${yaml}\n---\n# ${value.title}\n\n${body}`;
}
function safeTitle(title){return String(title||'').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/[. ]+$/,'').slice(0,100);}
class Create extends Modal{
  constructor(app,plugin,kind,question=''){super(app);this.plugin=plugin;this.kind=kind;this.value={title:'',teacher:'',source:'',parent:'',question,role:'老师原讲解',content:''};}
  onOpen(){const el=this.contentEl;el.createEl('h2',{text:({technique_node:'新建技巧节点',technique_lecture:'记录完整讲义',technique_analysis:'记录本题分析'})[this.kind]});
    for(const [key,label] of [['title','名称（必填）'],['teacher','老师'],['source','来源文件路径（MD / PDF）'],...(this.kind==='technique_analysis'?[['question','原题 MD 路径']]:[['parent','父技巧节点 ID（可选）']])])new Setting(el).setName(label).addText(t=>t.setValue(this.value[key]).onChange(v=>this.value[key]=v));
    new Setting(el).setName('内容归属').setDesc('明确区分来源，AI 建议不自动视为老师观点。').addDropdown(d=>d.addOptions({'老师原讲解':'老师原讲解','个人应用':'个人应用','AI建议':'AI建议'}).onChange(v=>this.value.role=v));
    new Setting(el).setName('内容').addTextArea(t=>t.setPlaceholder('完整讲义、方法步骤或本题分析').onChange(v=>this.value.content=v));
    new Setting(el).addButton(b=>b.setButtonText('保存 Markdown').setCta().onClick(async()=>{b.setDisabled(true);try{await this.plugin.create(this.kind,this.value);this.close();}catch(e){new Notice(e.message);b.setDisabled(false);}}));
  }
}
class HandbookView extends ItemView{
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.query='';this.teacher='';this.kind='';}
  getViewType(){return TYPE;}getDisplayText(){return '技巧宝典';}getIcon(){return 'book-open';}
  async onOpen(){this.render();}
  async onClose(){this.previewComponent?.unload();}
  render(){const el=this.contentEl;el.empty();el.addClass('technique-handbook');el.createEl('h2',{text:'技巧宝典'});el.createEl('p',{text:'以老师的方法体系组织技巧，分析关联原题，内容保存为独立 Markdown。',cls:'technique-muted'});
    const actions=el.createDiv({cls:'technique-actions'});for(const [kind,label]of [['technique_node','新建技巧'],['technique_lecture','记录讲义'],['technique_analysis','本题分析']]){const b=actions.createEl('button',{text:label});b.onclick=()=>new Create(this.app,this.plugin,kind,this.app.workspace.getActiveFile()?.path||'').open();}
    new Setting(el).setName('查找技巧、讲义或分析').addSearch(s=>s.setValue(this.query).onChange(v=>{this.query=v;this.renderList();}));
    const teachers=[...new Set(this.plugin.entries().map(x=>x.fm.teacher).filter(Boolean))];
    new Setting(el).setName('老师与内容').addDropdown(d=>{d.addOption('','全部老师');teachers.forEach(t=>d.addOption(t,t));d.setValue(this.teacher).onChange(v=>{this.teacher=v;this.renderList();});}).addDropdown(d=>d.addOptions({'':'全部内容',technique_node:'技巧节点',technique_lecture:'讲义',technique_analysis:'题目分析'}).setValue(this.kind).onChange(v=>{this.kind=v;this.renderList();}));
    this.list=el.createDiv();this.preview=el.createDiv({cls:'technique-preview'});this.renderList();
  }
  renderList(){if(!this.list)return;this.list.empty();const entries=this.plugin.entries();const visible=entries.filter(x=>(!this.teacher||x.fm.teacher===this.teacher)&&(!this.kind||x.fm.note_type===this.kind)&&`${x.file.basename} ${x.fm.teacher||''}`.toLowerCase().includes(this.query.toLowerCase()));
    if(!visible.length)this.list.createEl('p',{text:'暂无符合条件的内容。可以新建技巧，或从原题记录分析。'});
    for(const entry of visible){const row=this.list.createDiv({cls:'technique-row'});const title=row.createEl('button',{text:entry.file.basename});title.onclick=()=>this.show(entry);row.createSpan({text:`${entry.fm.teacher||'未标老师'} · ${entry.fm.evidence_role||'待核对'}`,cls:'technique-muted'});
      if(entry.fm.parent_id){const parent=entries.find(x=>x.fm.entity_id===entry.fm.parent_id);row.createSpan({text:'上级：'+(parent?.file.basename||'父节点未找到'),cls:'technique-muted'});}
    }
  }
  async show(entry){const token=Symbol();this.previewToken=token;const text=await this.app.vault.read(entry.file);if(this.previewToken!==token)return;this.previewComponent?.unload();this.preview.empty();this.previewComponent=new Component();this.previewComponent.load();const button=this.preview.createEl('button',{text:'打开原 Markdown 编辑'});button.onclick=()=>this.app.workspace.openLinkText(entry.file.path,'','tab');await MarkdownRenderer.render(this.app,text,this.preview,entry.file.path,this.previewComponent);}
}
class Handbook extends Plugin{
  async onload(){this.registerView(TYPE,l=>new HandbookView(l,this));this.addRibbonIcon('book-open','技巧宝典',()=>this.open());this.addCommand({id:'open',name:'打开技巧宝典',callback:()=>this.open()});this.addCommand({id:'analyze-current',name:'记录当前题目的技巧分析',callback:()=>new Create(this.app,this,'technique_analysis',this.app.workspace.getActiveFile()?.path||'').open()});this.registerEvent(this.app.metadataCache.on('changed',()=>{for(const leaf of this.app.workspace.getLeavesOfType(TYPE))leaf.view.renderList();}));}
  entries(){return this.app.vault.getMarkdownFiles().map(file=>({file,fm:this.app.metadataCache.getFileCache(file)?.frontmatter||{}})).filter(x=>['technique_node','technique_lecture','technique_analysis'].includes(x.fm.note_type));}
  async create(kind,value){const title=safeTitle(value.title);if(!title)throw Error('请填写名称。');if(value.question&&!this.app.vault.getAbstractFileByPath(value.question))throw Error('原题路径不存在，请填写库内完整路径。');if(value.source&&!this.app.vault.getAbstractFileByPath(value.source))throw Error('来源文件不存在。');if(value.parent&&!this.entries().some(x=>x.fm.entity_id===value.parent&&x.fm.note_type==='technique_node'))throw Error('找不到父技巧节点 ID。');
    const folder=ROOT+'/'+({technique_node:'技巧',technique_lecture:'讲义',technique_analysis:'题目分析'})[kind];for(const p of [ROOT,folder])if(!await this.app.vault.adapter.exists(p))await this.app.vault.createFolder(p);
    const path=`${folder}/${title}-${id().slice(0,8)}.md`;const file=await this.app.vault.create(path,documentFor(kind,{...value,title}));new Notice('已保存：'+title);return file;
  }
  async open(){let leaf=this.app.workspace.getLeavesOfType(TYPE)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:TYPE,active:true});}this.app.workspace.revealLeaf(leaf);}
  onunload(){this.app.workspace.detachLeavesOfType(TYPE);}
}
module.exports=Handbook;module.exports.__test={documentFor,safeTitle};
