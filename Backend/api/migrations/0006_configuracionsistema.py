from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import decimal


def crear_configuracion_inicial(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('api', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.get_or_create(
        clave='tipo_cambio_usd',
        defaults={'valor': decimal.Decimal('0.0000')},
    )


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0005_pagopasarela'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConfiguracionSistema',
            fields=[
                ('id_configuracion', models.AutoField(primary_key=True, serialize=False)),
                ('clave', models.CharField(max_length=60, unique=True)),
                ('valor', models.DecimalField(decimal_places=4, max_digits=10)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='api.usuario', db_column='actualizado_por')),
            ],
            options={'db_table': 'configuracion_sistema'},
        ),
        migrations.RunPython(crear_configuracion_inicial, migrations.RunPython.noop),
    ]
