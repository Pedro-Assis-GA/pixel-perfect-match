#!/usr/bin/env python3
"""Gate de aprovação + reciclagem de correções usando Codex CLI.

Uso: python quality_loop.py --repo PROJETO --config criterios.json --out RELATORIOS
Teste sem Codex: acrescente --simulate (usa resultados fictícios, não altera o projeto).
ATENÇÃO: codex exec real modifica a pasta do repositório; use backup/Git limpo.
"""
from __future__ import annotations
import argparse, json, subprocess, sys, shutil, datetime as dt
from pathlib import Path


def read_json(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def write_json(p, data):
    Path(p).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')


def run_cmd(args, cwd, stdin=None, timeout=900):
    # No Windows, npm e Codex podem ser arquivos .cmd; resolva a extensão via PATH.
    executable=shutil.which(args[0]) or args[0]
    args=[executable,*args[1:]]
    try:
        cp=subprocess.run(args,input=stdin, cwd=cwd, text=True, capture_output=True,
                          timeout=timeout,encoding='utf-8',errors='replace')
        return cp.returncode, (cp.stdout or '')+'\n'+(cp.stderr or '')
    except subprocess.TimeoutExpired:
        return 124,'TIMEOUT (tempo limite atingido)'
    except OSError as exc:
        return 127,str(exc)


def run_checks(checks, repo, out, cycle, simulate=False):
    records=[]
    for check in checks:
        cid=check['id']
        argv=check['argv']
        if not isinstance(argv,list) or not argv or not all(isinstance(s,str) and s for s in argv):
            raise ValueError(f'Comando inválido: {cid}')
        if simulate:
            rc = 1 if cycle==1 and check.get('required',True) else 0
            log=f'SIMULAÇÃO - ciclo {cycle} - comando {argv} - exit {rc}\n'
        else:
            rc,log=run_cmd(argv, repo, timeout=int(check.get('timeout_s',240)))
        logpath=out/f'ciclo_{cycle:02d}_{cid}.log'
        logpath.write_text(log,encoding='utf-8')
        records.append({'id':cid,'argv':argv,'required':bool(check.get('required',True)),
                        'exit_code':rc,'log':str(logpath)})
    return records


def gate(config, review, checks):
    if review.get('verdict')!='APROVADO':
        return False, f"Parecer do gerente: {review.get('verdict','ausente')}"
    submitted={c.get('id'):c for c in review.get('criteria',[]) if isinstance(c,dict)}
    for c in config['criteria']:
        if c.get('mandatory',True):
            response=submitted.get(c['id'])
            if not response or response.get('status')!='PASS':
                return False,f"Critério obrigatório não aprovado: {c['id']}"
            if not response.get('evidence'):
                return False,f"Critério sem evidência declarada: {c['id']}"
    for check in checks:
        if check['required'] and check['exit_code']!=0:
            return False,f"Verificação automatizada falhou: {check['id']} (exit={check['exit_code']})"
    return True,'Critérios obrigatórios aprovados e verificações automáticas sem falhas'


def main():
    ap=argparse.ArgumentParser(description='Ciclo executor -> testes -> gerente -> gate de liberação')
    ap.add_argument('--repo',required=True,help='Raiz do repositório local')
    ap.add_argument('--config',required=True,help='JSON com tarefa, critérios e testes')
    ap.add_argument('--out',required=True,help='Pasta dedicada aos registros, fora do código-fonte')
    ap.add_argument('--simulate',action='store_true',help='Demonstração segura sem chamar Codex nem modificar código')
    args=ap.parse_args()
    repo=Path(args.repo).resolve()
    config=read_json(args.config)
    out=Path(args.out).resolve()
    if not repo.is_dir():raise ValueError('Repositório não encontrado')
    if repo == out or out in [repo / p for p in ('src','node_modules','.git','.agents','.codex')]:
        raise ValueError('Escolha uma pasta dedicada de relatórios; não use uma pasta de código')
    out.mkdir(parents=True,exist_ok=True)
    criteria=config.get('criteria',[])
    if not criteria or any(not c.get('id') or not c.get('description') for c in criteria):
        raise ValueError('Configuração precisa ter critérios de aceite identificados e testáveis')
    max_cycles=int(config.get('max_cycles',4))
    if not 1<=max_cycles<=10:raise ValueError('max_cycles deve estar entre 1 e 10')
    if not args.simulate and not shutil.which('codex'):
        raise RuntimeError('Codex CLI não encontrado no PATH. Nenhuma alteração executada.')
    feedback=''
    known_failure=''
    history=[]
    for cycle in range(1,max_cycles+1):
        task=config['task']
        req='\n'.join(f"{c['id']}: {c['description']} (obrigatório={c.get('mandatory',True)})" for c in criteria)
        prompt=f'''Você é o AGENTE EXECUTOR. Corrija a tarefa dentro do repositório.
Tarefa: {task}
Critérios: {req}
Atue no código do projeto; execute verificações pertinentes; não faça push/deploy/remoções destrutivas.
Não esconda erros nem altere testes para forjar sucesso.
Feedback da rodada anterior: {feedback or 'inexistente'}
Registre apenas ações realmente realizadas. O gerente fará uma revisão independente.
'''
        exe_file=out/f'ciclo_{cycle:02d}_executor.txt'
        if args.simulate:
            exe_text=f'SIMULAÇÃO: executor ciclo {cycle}, nenhuma modificação real.'
            exe_rc=0
            exe_file.write_text(exe_text,encoding='utf-8')
        else:
            exe_rc,exe_output=run_cmd(['codex','exec','-C',str(repo),'-s','workspace-write',
                '-c','approval_policy=never','--output-last-message',str(exe_file),'-'],repo,
                stdin=prompt,timeout=int(config.get('codex_timeout_s',1200)))
            (out/f'ciclo_{cycle:02d}_executor_cli.log').write_text(exe_output,encoding='utf-8')
            exe_text=exe_file.read_text(encoding='utf-8') if exe_file.is_file() else exe_output[-2000:]
        checks=run_checks(config.get('checks',[]),repo,out,cycle,simulate=args.simulate)
        check_summary='\n'.join(f"{r['id']}: exit {r['exit_code']}; log {r['log']}" for r in checks)
        if args.simulate:
            approved=(cycle>=2)
            review={'verdict':'APROVADO' if approved else 'REPROVADO',
              'criteria':[{'id':c['id'],'status':'PASS' if approved else 'FAIL',
                         'evidence':['SIMULAÇÃO: nenhum teste real foi realizado'] if approved else [],
                         'finding':'Simulação ilustrativa'} for c in criteria],
              'blocking_issues':[] if approved else ['Simulação de falha na primeira rodada'],
              'feedback':'Reavaliar causa e executar nova correção'}
        elif exe_rc:
            review={'verdict':'INCONCLUSIVO','criteria':[],'blocking_issues':[f'Executor terminou com código {exe_rc}'],
                    'feedback':'Investigar motivo da interrupção e reexecutar.'}
        else:
            schema=Path(__file__).resolve().parent.parent/'references'/'review.schema.json'
            review_file=out/f'ciclo_{cycle:02d}_parecer.json'
            reviewer_prompt=f'''Você é o GERENTE DE QUALIDADE EM SOMENTE LEITURA. Use $quality-manager.
Seja independente das afirmações do executor. Leia código e git diff; confira critérios,
evidências, regressões e saídas dos testes. Critérios: {req}
Resumo do executor (é ALEGAÇÃO, não prova): {exe_text[:9000]}
Comandos executados independentemente, com log: {check_summary}
Não use 'APROVADO' se qualquer requisito obrigatório não estiver comprovado.
Para cada critério obrigatório, forneça PASS/FAIL/UNKNOWN e evidência verificável;
use evidência vazia se nada foi observado. Não edite arquivos. Retorne JSON conforme schema.
'''
            review_rc,review_output=run_cmd(['codex','exec','-C',str(repo),'-s','read-only',
                '-c','approval_policy=never','--output-schema',str(schema),
                '--output-last-message',str(review_file),'-'],repo,stdin=reviewer_prompt,
                timeout=int(config.get('review_timeout_s',900)))
            (out/f'ciclo_{cycle:02d}_gerente_cli.log').write_text(review_output,encoding='utf-8')
            try:
                review=read_json(review_file) if review_rc==0 else {
                  'verdict':'INCONCLUSIVO','criteria':[],'blocking_issues':['Falha na execução do gerente'],
                  'feedback':review_output[-1500:]}
            except (OSError,ValueError):
                review={'verdict':'INCONCLUSIVO','criteria':[],
                        'blocking_issues':['Resposta do gerente não é JSON válido'],
                        'feedback':'Repetir revisão estruturada.'}
        review_file=out/f'ciclo_{cycle:02d}_parecer.json'
        write_json(review_file,review)
        passed,reason=gate(config,review,checks)
        report={'cycle':cycle,'verdict':review.get('verdict'),'approved':passed,'reason':reason,
                'checks':checks,'review_path':str(review_file),'time_utc':dt.datetime.now(dt.timezone.utc).isoformat()}
        history.append(report)
        write_json(out/'historico_gate.json',history)
        print(f'Ciclo {cycle}/{max_cycles}: '+('APROVADO' if passed else 'RETORNAR AO EXECUTOR')+' | '+reason)
        if passed:
            result=(f'TAREFA APROVADA NO CICLO {cycle}\n\n{task}\n\n'+
                    f'Critérios obrigatórios: aprovados pelo gerente e gate; verificações automáticas: sem falhas.\n'+
                    f'Evidências e histórico: {out}\n\n'+exe_text)
            target=(out/'SIMULACAO_APROVADA_NAO_REAL.txt') if args.simulate else (out/'entrega_aprovada.txt')
            if args.simulate: result='SIMULAÇÃO - NÃO COMPROVA TRABALHO REAL\n\n'+result
            target.write_text(result,encoding='utf-8')
            print(('Simulação concluída: ' if args.simulate else 'Entrega liberada: ')+str(target))
            return 0
        fail_keys=[str(c.get('id')) for c in review.get('criteria',[]) if c.get('status') in ('FAIL','UNKNOWN')]
        feedback=(review.get('feedback') or reason)+'\nFalhas de critérios: '+', '.join(fail_keys)+'\n'+check_summary
        signature=reason+'|'+','.join(fail_keys)
        if signature==known_failure:
            feedback+='\nATENÇÃO: mesma falha repetida. Mude a hipótese/abordagem. Não repita solução idêntica.'
        known_failure=signature
    (out/'BLOQUEADO_SEM_APROVACAO.txt').write_text(
        f'Processo bloqueado após {max_cycles} ciclos. Não existe entrega aprovada.\n'+feedback,encoding='utf-8')
    print('BLOQUEADO: sem entrega final. Verifique permissões, ambiente ou critério impossível de demonstrar.')
    return 2

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,RuntimeError,OSError,KeyError) as e:
        print('IMPEDIMENTO:',str(e),file=sys.stderr);sys.exit(2)
