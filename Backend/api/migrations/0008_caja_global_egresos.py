# Generated for CU10: caja global, egresos and sale-to-register relation.
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q
from django.utils import timezone

class Migration(migrations.Migration):
    dependencies = [('api', '0007_metodopago_activo')]
    operations = [
        migrations.AlterField(model_name='arqueocaja', name='id_administrador', field=models.ForeignKey(blank=True, db_column='id_administrador', null=True, on_delete=django.db.models.deletion.RESTRICT, to='api.administrador')),
        migrations.AddField(model_name='arqueocaja', name='responsable', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='cajas_asignadas', to='api.usuario')),
        migrations.AddField(model_name='arqueocaja', name='turno', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, to='api.turno')),
        migrations.AddField(model_name='arqueocaja', name='efectivo_contado', field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name='arqueocaja', name='diferencia', field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name='arqueocaja', name='estado', field=models.CharField(choices=[('ABIERTA','Abierta'),('CERRADA','Cerrada')], default='CERRADA', max_length=10)),
        migrations.AddField(model_name='venta', name='caja', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='ventas', to='api.arqueocaja')),
        migrations.CreateModel(name='EgresoCaja', fields=[('id_egreso', models.AutoField(primary_key=True, serialize=False)),('fecha_hora', models.DateTimeField(auto_now_add=True)),('concepto', models.CharField(max_length=180)),('monto', models.DecimalField(decimal_places=2,max_digits=12)),('observacion', models.TextField(blank=True,null=True)),('caja',models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT,related_name='egresos',to='api.arqueocaja')),('usuario',models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT,to='api.usuario'))], options={'db_table':'egreso_caja','ordering':['-fecha_hora']}),
        migrations.AddConstraint(model_name='arqueocaja', constraint=models.UniqueConstraint(condition=Q(estado='ABIERTA'), fields=('estado',), name='una_sola_caja_abierta_global')),
    ]
