# Registro de pagos externos para evitar contratos duplicados por reintentos.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0004_turnos_base'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PagoPasarela',
            fields=[
                ('id_pago', models.AutoField(primary_key=True, serialize=False)),
                ('proveedor', models.CharField(default='PAYPAL', max_length=20)),
                ('id_orden_externa', models.CharField(max_length=100, unique=True)),
                ('id_captura_externa', models.CharField(blank=True, max_length=100, null=True, unique=True)),
                ('tipo_operacion', models.CharField(default='MEMBRESIA', max_length=20)),
                ('monto_local', models.DecimalField(decimal_places=2, max_digits=12)),
                ('monto_usd', models.DecimalField(decimal_places=2, max_digits=12)),
                ('tasa_cambio', models.DecimalField(decimal_places=4, max_digits=10)),
                ('estado', models.CharField(choices=[('PENDIENTE', 'Pendiente'), ('COMPLETADO', 'Completado'), ('CANCELADO', 'Cancelado'), ('FALLIDO', 'Fallido')], default='PENDIENTE', max_length=20)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
                ('id_contrato_mem', models.ForeignKey(blank=True, db_column='id_contrato_mem', null=True, on_delete=django.db.models.deletion.RESTRICT, to='api.contratomembresia')),
                ('id_plan_mem', models.ForeignKey(db_column='id_plan_mem', on_delete=django.db.models.deletion.RESTRICT, to='api.planmembresia')),
                ('id_socio', models.ForeignKey(db_column='id_socio', on_delete=django.db.models.deletion.RESTRICT, to='api.socio')),
                ('id_usuario', models.ForeignKey(db_column='id_usuario', on_delete=django.db.models.deletion.RESTRICT, to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'pago_pasarela', 'ordering': ['-fecha_creacion']},
        ),
    ]
