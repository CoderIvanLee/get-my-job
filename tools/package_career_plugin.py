#!/usr/bin/env python3
"""Build the ChatGPT skills-only plugin from canonical career skill sources."""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = 'xiangzhi-ai-career'
SKILLS = {
    'qz-profile': ('AI 求职建档', '面向 AI 应用与 Agent 岗位，从真实资料建立或增量更新可追溯档案', '使用 $qz-profile，根据我提供的简历和项目资料整理 AI 求职档案。'),
    'qz-job-fit': ('AI 岗位与能力分析', '比较 AI 应用、RAG 和 Agent 岗位，提炼有原文依据的能力需求与差距', '使用 $qz-job-fit，比较我提供的岗位并提炼共同能力要求。'),
    'qz-project-coach': ('AI 项目成长教练', '把 AI 应用与 Agent 能力差距拆成可执行任务、学习资源和实际成果验收', '使用 $qz-project-coach，根据我的背景和目标岗位安排真实项目实践。'),
    'qz-interview-coach': ('AI 面试教练', '练习 AI 应用与 Agent 项目面试、英文介绍和答辩，反馈基于实际回答', '使用 $qz-interview-coach，基于我的真实项目进行中文或英文面试练习。'),
}
MANIFEST = {
    '$schema': 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    'name': NAME,
    'version': '0.1.0',
    'description': 'AI 应用开发与 AI Agent 求职辅导：真实建档、岗位分析、项目成长及中英文面试。',
    'license': 'MIT',
    'extensions': {'com.openai': {'interface': {
        'displayName': '向职 · AI 求职助手',
        'shortDescription': 'AI 应用与 Agent 求职、成长和面试',
        'longDescription': '四个可独立使用的中文 Skill：求职建档、岗位与能力分析、项目成长教练、面试教练。依据用户在聊天中提供的资料工作，区分真实经历、本人贡献和证据验证范围。无需额外 API Key；不自动连接本地网站，不提供未接入的语音或存储服务。',
        'developerName': '向职开源项目',
        'category': 'Productivity',
        'capabilities': [],
        'defaultPrompt': ['根据我的简历建立 AI 求职档案。', '比较这些 AI 岗位，安排学习与项目实践。', '帮我练习 AI 项目面试或改写英文自我介绍。'],
    }}},
}

def build():
    assert len(MANIFEST['extensions']['com.openai']['interface']['shortDescription']) <= 30
    output = ROOT / 'docs' / f'{NAME}-plugin.zip'
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f'{NAME}/plugin.json', json.dumps(MANIFEST, ensure_ascii=False, indent=2) + '\n')
        archive.write(ROOT / 'LICENSE', f'{NAME}/LICENSE')
        for slug, (title, description, prompt) in SKILLS.items():
            assert 25 <= len(description) <= 64
            source = ROOT / '.claude' / 'skills' / slug / 'SKILL.md'
            archive.write(source, f'{NAME}/skills/{slug}/SKILL.md')
            # Quoted values, unquoted keys; no product or execution restrictions.
            metadata = 'interface:\n' + ''.join(f'  {key}: {json.dumps(value, ensure_ascii=False)}\n' for key, value in {'display_name': title, 'short_description': description, 'default_prompt': prompt}.items())
            archive.writestr(f'{NAME}/skills/{slug}/agents/openai.yaml', metadata)
    with zipfile.ZipFile(output) as archive:
        actual = json.loads(archive.read(f'{NAME}/plugin.json'))
        assert actual == MANIFEST
        for slug in SKILLS:
            assert archive.read(f'{NAME}/skills/{slug}/SKILL.md') == (ROOT / '.claude/skills' / slug / 'SKILL.md').read_bytes()
        assert len(archive.namelist()) == 10
        print('\n'.join(archive.namelist()))
    print(str(output))
    return output

if __name__ == '__main__':
    build()
