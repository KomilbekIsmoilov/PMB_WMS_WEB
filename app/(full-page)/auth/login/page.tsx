/* eslint-disable @next/next/no-img-element */
'use client';
import { useRouter } from 'next/navigation';
import React, { useContext, useEffect, useState } from 'react';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { Password } from 'primereact/password';
import { LayoutContext } from '../../../../layout/context/layoutcontext';
import { InputText } from 'primereact/inputtext';
import { classNames } from 'primereact/utils';
import api from '@/app/api/api';

const LoginPage = () => {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('');
    const [checked, setChecked] = useState(false);
    const [loading, setLoading] = useState(false)
    const { layoutConfig } = useContext(LayoutContext);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(()=>{
    const login = localStorage.getItem('login') 
    setUsername(login|| '')
    } , [])

    const onSubmit = async () => {
        try {
            setLoading(true)
            
            const res = await api.post('http://213.230.124.245:5010/api/LoginWEBApi' , {Login : username , Password : password})
            setErrorMessage('');
            localStorage.setItem('token' , res.data.token)
            localStorage.setItem('userData', JSON.stringify(res.data));
            localStorage.setItem('filial', res.data.user.filial);
            localStorage.setItem('login', username);
            setLoading(false)
            window.location.href = '/pages/dashboard';
        } catch (error) {
            setErrorMessage('Логин или пароль неверный');
            setLoading(false)
        }
    };


    const router = useRouter();
    const containerClassName = classNames('surface-ground flex align-items-center justify-content-center min-h-screen min-w-screen overflow-hidden', { 'p-input-filled': layoutConfig.inputStyle === 'filled' });

    return (
        <div className={containerClassName}>
            <div className="flex flex-column align-items-center justify-content-center">
                <div
                    style={{
                        borderRadius: '56px',
                        padding: '0.3rem',
                        background: 'linear-gradient(180deg, var(--primary-color) 10%, rgba(33, 150, 243, 0) 30%)'
                    }}
                >
                    <div className="w-full surface-card py-8 px-5 sm:px-8" style={{ borderRadius: '53px' }}>
                        <div className="text-center mb-5">
                            <img src={`/layout/images/image.png`} alt="Sakai logo" className="mb-5 w-20rem flex-shrink-0" />
                            <div className="text-900 text-3xl font-medium mb-3">Добро пожаловать</div>
                            <span className="text-600 font-medium">Войдите, чтобы продолжить</span>
                        </div>

                        <div>
                            <label htmlFor="username" className="block text-900 text-xl font-medium mb-2">
                                Логин
                            </label>
                            <InputText value={username} required onChange={(e) => setUsername(e.target.value)} id="username" type="text" placeholder="Введите логин" className="w-full md:w-30rem mb-5" style={{ padding: '1rem' }} />

                            <label htmlFor="password1" className="block text-900 font-medium text-xl mb-2">
                                Пароль
                            </label>
                            <Password
                                required
                                inputId="password1"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Введите пароль"
                                toggleMask
                                className="w-full mb-5"
                                inputClassName="w-full p-3 md:w-30rem"
                                onSubmit={onSubmit}
                            />
                            {errorMessage && (
                                <div className="text-red-500 text-sm mb-4">{errorMessage}</div>
                            )}

                            <div className="flex align-items-center justify-content-between mb-5 gap-5">
                                <div className="flex align-items-center">
                                    <Checkbox inputId="rememberme1" checked={checked} onChange={(e) => setChecked(e.checked ?? false)} className="mr-2"></Checkbox>
                                    <label htmlFor="rememberme1">Запомнить меня</label>
                                </div>

                            </div>
                            <Button loading={loading} label="Войти" className="w-full p-3 text-xl" onClick={onSubmit}></Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;