import io
import json
import math
import unittest
from app import application
from physics import transmon, rabi, sensing, cryogenics, environment

class PhysicsTests(unittest.TestCase):
    def test_pi_pulse_and_unitarity(self):
        result = rabi({'omegaMHz': 10, 'durationNs': 50, 'phaseDeg': 90})
        self.assertAlmostEqual(result['idealP1'], 1)
        for row in result['unitary']:
            self.assertAlmostEqual(sum(a*a+b*b for a,b in row), 1)
    def test_transmon_spectrum(self):
        result = transmon({})
        self.assertLess(abs(result['f01GHz']-(math.sqrt(48)-.3)), .05)
        self.assertTrue(-.4 < result['anharmonicityGHz'] < -.25)
    def test_sensing_scaling(self):
        a = sensing({'shots': 100})
        b = sensing({'shots': 400})
        self.assertAlmostEqual(a['quadratureUncertainty']/b['quadratureUncertainty'], 2)
    def test_heat_and_shielding(self):
        self.assertGreater(cryogenics({'heatUW': 4})['equilibriumK'], cryogenics({})['equilibriumK'])
        self.assertAlmostEqual(environment({'rfVM': 1,'shieldDB': 20})['rfResidualVM'], .1)
    def call(self, payload, path='/api/lab/rabi', origin=''):
        body = json.dumps(payload).encode(); status=[]
        result = application({'REQUEST_METHOD':'POST','PATH_INFO':path,'CONTENT_TYPE':'application/json','CONTENT_LENGTH':str(len(body)),'wsgi.input':io.BytesIO(body),'HTTP_ORIGIN':origin},lambda s,h:status.append(s))
        return status[0], json.loads(b''.join(result))
    def test_api_validation(self):
        self.assertEqual(self.call({'omegaMHz':10})[0], '200 OK')
        self.assertEqual(self.call({'omegaMHz':'bad'})[0], '400 Bad Request')
        self.assertEqual(self.call({'durationNs':-1})[0], '400 Bad Request')
        self.assertEqual(self.call({})[1]['modelVersion'], '1.0')
        self.assertEqual(self.call({}, origin='https://untrusted.invalid')[0], '403 Forbidden')
    def test_wsgi_content_type_length_chunked_and_deep_json(self):
        def call(body, content_type='application/json', *, length='provided', terminated=False):
            status=[]
            env={'REQUEST_METHOD':'POST','PATH_INFO':'/api/lab/rabi',
                 'CONTENT_TYPE':content_type,'wsgi.input':io.BytesIO(body)}
            if length == 'provided':
                env['CONTENT_LENGTH']=str(len(body))
            elif length == 'bad':
                env['CONTENT_LENGTH']='abc'
            if terminated:
                env['wsgi.input_terminated']=True
            result=application(env,lambda s,h:status.append(s))
            return status[0],json.loads(b''.join(result))
        valid=b'{"omegaMHz":10}'
        self.assertEqual(call(valid,'application/jsonfoo')[0],'415 Unsupported Media Type')
        self.assertEqual(call(valid,'application/json; charset=utf-8')[0],'200 OK')
        self.assertEqual(call(valid,length='missing')[0],'411 Length Required')
        self.assertEqual(call(valid,length='missing',terminated=True)[0],'200 OK')
        self.assertEqual(call(valid,length='bad')[0],'400 Bad Request')
        self.assertEqual(call(valid+b' '*(16385-len(valid)),length='missing',terminated=True)[0],'413 Payload Too Large')
        nested=b'['*1500+b'0'+b']'*1500
        status,payload=call(nested)
        self.assertEqual(status,'400 Bad Request')
        self.assertIn('error',payload)
    def test_json_nan(self):
        self.assertEqual(self.call({'omegaMHz':float('nan')})[0], '400 Bad Request')
if __name__ == '__main__': unittest.main()
