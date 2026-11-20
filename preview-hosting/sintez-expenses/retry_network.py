"""Retry transient read-only HTTPS failures; never accept missing/changed assets."""
import runpy,sys,time
import urllib.request
from urllib.error import HTTPError,URLError
_native=urllib.request.urlopen
TRANSIENT={429,500,502,503,504}
def open_retry(request,*args,**kwargs):
    for attempt in range(5):
        try:return _native(request,*args,**kwargs)
        except HTTPError as error:
            if error.code not in TRANSIENT or attempt==4:raise
            delay=min(30,max(1,int(error.headers.get('Retry-After','0')))) if error.headers and error.headers.get('Retry-After','').isdigit() else 2**attempt
            print('Retrying temporary HTTP '+str(error.code)+' read ('+str(attempt+1)+'/4).',flush=True)
            error.close()
        except (URLError,TimeoutError,ConnectionError):
            if attempt==4:raise
            delay=2**attempt
            print('Retrying interrupted HTTPS read ('+str(attempt+1)+'/4).',flush=True)
        time.sleep(delay)
if __name__=='__main__':
    urllib.request.urlopen=open_retry
    sys.argv=sys.argv[1:]
    runpy.run_path(sys.argv[0],run_name='__main__')
