# -*- coding: utf-8 -*-
import io, re

p = r'C:\Users\lenovo\Doubao\chats\2026-09-17\new-chat-2\formula-challenge-v2\.gitignore'
s = io.open(p, encoding='utf-8').read()

# 清理乱码注释行（PowerShell 读到的是 GBK 乱码，但文件实际是 UTF-8 中文，这里仅处理明显的重复行尾噪声，不做大改）
# 追加忽略规则
add = """
# 本地数据库与备份（不入库，由 seed 重建）
prisma/dev.db
backups/
*.db.bak

# 临时脚本/产物
_extract_pdf.cjs
"""
if 'prisma/dev.db' not in s:
    s = s.rstrip() + '\n' + add

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('gitignore updated')
